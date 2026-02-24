// Purelyd Audio Proxy - Cloudflare Worker v4
// Uses Cobalt API for YouTube audio extraction + Piped fallback

const WORKER_CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// Cobalt API instances
const WORKER_COBALT_INSTANCES = [
    'https://api.cobalt.tools',
    'https://cobalt-api.kwiatekmiki.com',
    'https://cobalt.api.timelessnesses.me',
];

// Piped API instances (fallback)
const WORKER_PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://watchapi.whatever.social',
    'https://pipedapi.leptons.xyz',
];

export default {
    async fetch(request, env) {
        try {
            if (request.method === 'OPTIONS') {
                return new Response(null, { headers: WORKER_CORS_HEADERS });
            }

            const url = new URL(request.url);

            if (url.pathname === '/stream') {
                const videoId = url.searchParams.get('v');
                if (!videoId) return jsonResponse({ error: 'Missing video ID' }, 400);
                return await handleStream(videoId);
            }

            if (url.pathname === '/proxy') {
                const audioUrl = url.searchParams.get('url');
                if (!audioUrl) return jsonResponse({ error: 'Missing URL' }, 400);
                return await handleProxy(audioUrl, request);
            }

            if (url.pathname === '/search') {
                const query = url.searchParams.get('q');
                if (!query) return jsonResponse({ error: 'Missing query' }, 400);
                return await handleSearch(query);
            }

            if (url.pathname === '/trending') {
                return await handleTrending();
            }

            if (url.pathname === '/playlist') {
                const listId = url.searchParams.get('list');
                if (!listId) return jsonResponse({ error: 'Missing playlist ID' }, 400);
                return await handlePlaylist(listId);
            }

            return jsonResponse({ routes: ['/stream?v=VIDEO_ID', '/proxy?url=AUDIO_URL', '/search?q=QUERY', '/playlist?list=LIST_ID', '/trending'] }, 200);
        } catch (e) {
            return jsonResponse({ status: 'critical_error', message: e.message, stack: e.stack }, 500);
        }
    }
};

async function handlePlaylist(listId) {
    const errors = [];
    try {
        const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
        const browseId = listId.startsWith('VL') ? listId : `VL${listId}`;

        const body = {
            context: {
                client: {
                    clientName: 'WEB_MUSIC',
                    clientVersion: '1.20230712.01.00',
                    hl: 'es', gl: 'ES',
                }
            },
            browseId: browseId
        };

        const response = await fetch(
            `https://music.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}&prettyPrint=false`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://music.youtube.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10000),
            }
        );

        if (response.ok) {
            const data = await response.json();
            const section = data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer;
            const contents = section?.contents || [];

            const results = contents.map(c => {
                const item = c.musicResponsiveListItemRenderer;
                if (!item) return null;
                const vId = item.playlistItemData?.videoId;
                if (!vId) return null;

                const title = item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "Unknown";
                const artist = item.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "YouTube";
                const thumb = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url;

                return {
                    id: 'yt-' + vId,
                    title: title,
                    artist: artist,
                    url: `https://www.youtube.com/watch?v=${vId}`,
                    cover: thumb?.replace(/w\d+-h\d+/, 'w544-h544') || `https://img.youtube.com/vi/${vId}/hqdefault.jpg`,
                    type: 'youtube'
                };
            }).filter(i => i !== null);

            return jsonResponse({ status: 'ok', source: 'innertube_playlist', count: results.length, results: results });
        } else {
            errors.push(`innertube: HTTP ${response.status}`);
        }
    } catch (e) {
        errors.push(`innertube error: ${e.message}`);
    }
    return jsonResponse({ status: 'error', message: 'Could not fetch playlist metadata', attempts: errors }, 500);
}

async function handleTrending() {
    const errors = [];
    try {
        const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
        const body = {
            context: {
                client: {
                    clientName: 'WEB_MUSIC',
                    clientVersion: '1.20230712.01.00',
                    hl: 'es', gl: 'ES',
                }
            },
            browseId: 'FEmusic_trending'
        };

        const response = await fetch(
            `https://music.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}&prettyPrint=false`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://music.youtube.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10000),
            }
        );

        if (response.ok) {
            const data = await response.json();

            // Support multiple formats for trending music
            let shelfList = [];

            // Format 1: Direct contents list
            if (data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents) {
                shelfList = data.contents.singleColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents;
            }
            // Format 2: Direct sectionList
            else if (data.contents?.sectionListRenderer?.contents) {
                shelfList = data.contents.sectionListRenderer.contents;
            }

            let allResults = [];

            for (const section of shelfList) {
                const shelf = section.musicCarouselShelfRenderer || section.musicShelfRenderer;
                if (!shelf || !shelf.contents) continue;

                const items = shelf.contents.map(c => {
                    const item = c.musicTwoColumnItemRenderer || c.musicResponsiveListItemRenderer;
                    if (!item) return null;

                    const nav = item.navigationEndpoint || item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
                    const vId = nav?.watchEndpoint?.videoId;
                    if (!vId) return null;

                    const title = (item.title?.runs?.[0]?.text || item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text) || "Unknown";
                    const artist = (item.subtitle?.runs?.[0]?.text || item.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text) || "YouTube";
                    const thumb = item.thumbnail?.thumbnails?.[0]?.url || item.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url;

                    return {
                        id: 'yt-' + vId,
                        title: title,
                        artist: artist,
                        url: `https://www.youtube.com/watch?v=${vId}`,
                        cover: thumb?.replace(/w\d+-h\d+/, 'w544-h544') || `https://img.youtube.com/vi/${vId}/hqdefault.jpg`,
                        type: 'youtube'
                    };
                }).filter(i => i !== null);

                allResults = allResults.concat(items);
            }

            // Limit to top 40 or so
            const results = allResults.slice(0, 40);

            return jsonResponse({
                status: 'ok',
                source: 'innertube_trending',
                count: results.length,
                results: results
            });
        } else {
            errors.push(`innertube: HTTP ${response.status}`);
        }
    } catch (e) {
        errors.push(`innertube error: ${e.message}`);
    }
    return jsonResponse({ status: 'error', message: 'Could not fetch trending music', attempts: errors }, 500);
}

async function handleSearch(query) {
    const errors = [];

    // === Strategy 1: YouTube Music Innertube ===
    try {
        const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
        const body = {
            context: {
                client: {
                    clientName: 'WEB_MUSIC',
                    clientVersion: '1.20230712.01.00',
                    hl: 'es', gl: 'ES',
                }
            },
            query: query
        };

        const response = await fetch(
            `https://music.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}&prettyPrint=false`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://music.youtube.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(6000),
            }
        );

        if (response.ok) {
            const data = await response.json();
            let shelf = null;
            const tabs = data.contents?.tabbedSearchResultsRenderer?.tabs;
            if (tabs) {
                const sectionList = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
                shelf = sectionList.find(c => c.musicShelfRenderer)?.musicShelfRenderer;
            }
            if (!shelf) {
                const sectionList = data.contents?.sectionListRenderer?.contents || [];
                shelf = sectionList.find(c => c.musicShelfRenderer)?.musicShelfRenderer;
            }

            if (shelf && shelf.contents) {
                const items = shelf.contents.map(c => {
                    const item = c.musicTwoColumnItemRenderer || c.musicResponsiveListItemRenderer;
                    if (!item) return null;
                    const nav = item.navigationEndpoint || item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
                    const vId = nav?.watchEndpoint?.videoId;
                    if (!vId) return null;
                    const title = (item.title?.runs?.[0]?.text || item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text) || "Unknown";
                    const artist = (item.subtitle?.runs?.[0]?.text || item.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text) || "YouTube";
                    const thumb = item.thumbnail?.thumbnails?.[0]?.url || item.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url;

                    return {
                        id: 'yt-' + vId, title, artist,
                        url: `https://www.youtube.com/watch?v=${vId}`,
                        cover: thumb?.replace(/w\d+-h\d+/, 'w544-h544') || `https://img.youtube.com/vi/${vId}/hqdefault.jpg`,
                        type: 'youtube'
                    };
                }).filter(i => i !== null);

                if (items.length > 0) return jsonResponse({ status: 'ok', source: 'innertube_music', results: items });
            }
            errors.push('innertube_music: no results found in shelf');
        } else {
            errors.push(`innertube_music: HTTP ${response.status}`);
        }
    } catch (e) {
        errors.push(`innertube_music error: ${e.message}`);
    }

    // === Strategy 2: Android Search ===
    try {
        const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
        const body = {
            context: { client: { clientName: 'ANDROID', clientVersion: '17.31.35', androidSdkVersion: 30, hl: 'es', gl: 'ES' } },
            query: query
        };
        const response = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(6000),
        });
        if (response.ok) {
            const data = await response.json();
            const sectionList = data.contents?.sectionListRenderer?.contents || [];
            const resultsShelf = sectionList.find(c => c.itemSectionRenderer)?.itemSectionRenderer?.contents || [];
            const items = resultsShelf.map(c => {
                const v = c.videoRenderer;
                if (!v || !v.videoId) return null;
                return {
                    id: 'yt-' + v.videoId, title: v.title?.runs?.[0]?.text || "Unknown",
                    artist: v.longBylineText?.runs?.[0]?.text || v.ownerText?.runs?.[0]?.text || "YouTube",
                    url: `https://www.youtube.com/watch?v=${v.videoId}`,
                    cover: v.thumbnail?.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`,
                    type: 'youtube'
                };
            }).filter(i => i !== null);
            if (items.length > 0) return jsonResponse({ status: 'ok', source: 'innertube_android', results: items });
        }
    } catch (e) { errors.push(`innertube_android error: ${e.message}`); }

    // === Strategy 3: Piped Search ===
    for (const instance of WORKER_PIPED_INSTANCES.slice(0, 2)) {
        try {
            const response = await fetch(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&filter=music_videos`, { signal: AbortSignal.timeout(5000) });
            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('application/json')) {
                    errors.push(`piped(${instance}): Non-JSON response (${contentType})`);
                    continue;
                }
                const data = await response.json();
                const items = (data.items || []).slice(0, 10).map(item => {
                    if (!item.url) return null;
                    const vIdMatch = item.url.match(/[?&]v=([^#&?]+)/) || item.url.match(/vi\/([^#&?]+)/) || [null, item.url.split('/').pop()];
                    const vId = vIdMatch[1] || vIdMatch[0];
                    if (!vId) return null;

                    return {
                        id: 'yt-' + vId, title: item.title, artist: item.uploaderName || "YouTube",
                        url: 'https://www.youtube.com/watch?v=' + vId, cover: item.thumbnail || "", type: 'youtube'
                    };
                }).filter(i => i !== null);
                if (items.length > 0) return jsonResponse({ status: 'ok', source: `piped_${instance}`, results: items });
            } else {
                errors.push(`piped(${instance}): HTTP ${response.status}`);
            }
        } catch (e) { errors.push(`piped(${instance}): ${e.message}`); }
    }

    return jsonResponse({ status: 'error', message: 'All search strategies failed', debug: { query, attempts: errors } }, 500);
}

async function handleStream(videoId) {
    const errors = [];

    // === Strategy 1: Cobalt API ===
    for (const instance of WORKER_COBALT_INSTANCES) {
        try {
            const response = await fetch(instance, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: `https://youtube.com/watch?v=${videoId}`,
                    downloadMode: 'audio',
                    audioFormat: 'opus',
                }),
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                errors.push(`cobalt(${instance}): HTTP ${response.status}`);
                continue;
            }

            const data = await response.json();

            if (data.status === 'tunnel' || data.status === 'redirect') {
                const audioUrl = data.url;
                if (audioUrl) {
                    return jsonResponse({
                        status: 'ok',
                        videoId,
                        source: 'cobalt',
                        url: audioUrl,
                        filename: data.filename || '',
                    });
                }
            }

            if (data.status === 'stream') {
                const audioUrl = data.url;
                if (audioUrl) {
                    return jsonResponse({
                        status: 'ok',
                        videoId,
                        source: 'cobalt',
                        url: audioUrl,
                        filename: data.filename || '',
                    });
                }
            }

            errors.push(`cobalt(${instance}): status=${data.status} ${data.text || ''}`);
        } catch (e) {
            errors.push(`cobalt(${instance}): ${e.message}`);
        }
    }

    // === Strategy 2: Piped API ===
    for (const instance of WORKER_PIPED_INSTANCES) {
        try {
            const response = await fetch(`${instance}/streams/${videoId}`, {
                headers: { 'User-Agent': 'Purelyd/1.0' },
                signal: AbortSignal.timeout(8000),
            });

            if (!response.ok) {
                errors.push(`piped(${instance}): HTTP ${response.status}`);
                continue;
            }

            const data = await response.json();
            if (data.error) {
                errors.push(`piped(${instance}): ${data.error}`);
                continue;
            }

            const audioStreams = (data.audioStreams || []).filter(s => s.url);
            if (audioStreams.length > 0) {
                const best = audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                return jsonResponse({
                    status: 'ok',
                    videoId,
                    source: 'piped',
                    bitrate: best.bitrate,
                    mimeType: best.mimeType,
                    url: best.url,
                    duration: data.duration,
                    title: data.title,
                });
            }
            errors.push(`piped(${instance}): no audio streams`);
        } catch (e) {
            errors.push(`piped(${instance}): ${e.message}`);
        }
    }

    // === Strategy 3: Direct Innertube ===
    try {
        const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
        const body = {
            videoId,
            context: {
                client: {
                    clientName: 'ANDROID_TESTSUITE',
                    clientVersion: '1.9',
                    androidSdkVersion: 30,
                    hl: 'en', gl: 'US',
                }
            },
            contentCheckOk: true,
            racyCheckOk: true,
        };

        const response = await fetch(
            `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'com.google.android.youtube/1.9 (Linux; U; Android 11) gzip',
                },
                body: JSON.stringify(body),
            }
        );

        if (response.ok) {
            const data = await response.json();
            if (data.playabilityStatus?.status === 'OK') {
                const formats = data.streamingData?.adaptiveFormats || [];
                const audio = formats
                    .filter(f => f.mimeType?.startsWith('audio/') && f.url)
                    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                if (audio.length > 0) {
                    return jsonResponse({
                        status: 'ok',
                        videoId,
                        source: 'innertube',
                        bitrate: audio[0].bitrate,
                        mimeType: audio[0].mimeType,
                        url: audio[0].url,
                        duration: data.videoDetails?.lengthSeconds,
                        title: data.videoDetails?.title,
                    });
                }
            }
            errors.push(`innertube: ${data.playabilityStatus?.status || 'UNKNOWN'}`);
        }
    } catch (e) {
        errors.push(`innertube: ${e.message}`);
    }

    return jsonResponse({
        status: 'error',
        message: 'Could not extract audio from any source',
        videoId,
        attempts: errors,
    }, 500);
}

async function handleProxy(audioUrl, request) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        };

        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) headers['Range'] = rangeHeader;

        const response = await fetch(audioUrl, { headers });

        if (!response.ok && response.status !== 206) {
            return jsonResponse({ error: `Upstream: ${response.status}` }, response.status);
        }

        const respHeaders = new Headers(WORKER_CORS_HEADERS);
        respHeaders.set('Content-Type', response.headers.get('Content-Type') || 'audio/webm');
        if (response.headers.get('Content-Length')) respHeaders.set('Content-Length', response.headers.get('Content-Length'));
        respHeaders.set('Accept-Ranges', 'bytes');
        if (response.headers.get('Content-Range')) respHeaders.set('Content-Range', response.headers.get('Content-Range'));

        return new Response(response.body, { status: response.status, headers: respHeaders });
    } catch (e) {
        return jsonResponse({ error: e.message }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...WORKER_CORS_HEADERS },
    });
}
