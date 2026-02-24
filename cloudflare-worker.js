// Purelyd Audio Proxy - Cloudflare Worker v4
// Uses Cobalt API for YouTube audio extraction + Piped fallback

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// Cobalt API instances
const COBALT_INSTANCES = [
    'https://api.cobalt.tools',
    'https://cobalt-api.kwiatekmiki.com',
    'https://cobalt.api.timelessnesses.me',
];

// Piped API instances (fallback)
const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://watchapi.whatever.social',
    'https://pipedapi.leptons.xyz',
];

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: CORS_HEADERS });
        }

        const url = new URL(request.url);

        if (url.pathname === '/stream') {
            const videoId = url.searchParams.get('v');
            if (!videoId) return jsonResponse({ error: 'Missing video ID' }, 400);
            return handleStream(videoId);
        }

        if (url.pathname === '/proxy') {
            const audioUrl = url.searchParams.get('url');
            if (!audioUrl) return jsonResponse({ error: 'Missing URL' }, 400);
            return handleProxy(audioUrl, request);
        }

        return jsonResponse({ routes: ['/stream?v=VIDEO_ID', '/proxy?url=AUDIO_URL'] }, 200);
    }
};

async function handleStream(videoId) {
    const errors = [];

    // === Strategy 1: Cobalt API ===
    for (const instance of COBALT_INSTANCES) {
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
                // Cobalt returns a direct URL
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

    // === Strategy 2: Piped API (fallback) ===
    for (const instance of PIPED_INSTANCES) {
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

    // === Strategy 3: Direct Innertube (last resort) ===
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

        const respHeaders = new Headers(CORS_HEADERS);
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
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
