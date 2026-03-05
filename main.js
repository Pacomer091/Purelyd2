// SoundCloud Official Direct API
const SC_CLIENT_ID = 'FqfkxJZWPZt411KWUg3pxbwm43M6UalQ';
const SC_API_BASE = 'https://api-v2.soundcloud.com';

// CORS Proxy Pool - se intentan en orden hasta que uno funcione
const CORS_PROXIES = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
];

async function fetchSCApi(apiPath, isRawUrl = false) {
    if (!apiPath) return null;

    let urlToFetch = apiPath.toString();
    // Bulletproof: if it's already a full URL, don't prepend SC_API_BASE
    const isFullUrl = urlToFetch.startsWith('http');

    if (!isRawUrl && !isFullUrl) {
        urlToFetch = SC_API_BASE + (urlToFetch.startsWith('/') ? '' : '/') + urlToFetch;
    }

    // Safety check for any previous duplication
    if (urlToFetch.includes('soundcloud.comhttps')) {
        urlToFetch = urlToFetch.replace('https://api-v2.soundcloud.comhttps://api-v2.soundcloud.com', 'https://api-v2.soundcloud.com');
    }
    // Asegurar client_id siempre para no ser rechazados (401)
    if (!urlToFetch.includes('client_id=')) {
        urlToFetch += (urlToFetch.includes('?') ? '&' : '?') + 'client_id=' + SC_CLIENT_ID;
    }

    for (const proxy of CORS_PROXIES) {
        try {
            const proxyUrl = proxy(urlToFetch);
            const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
            if (response.ok) {
                const text = await response.text();
                if (text.startsWith('{') || text.startsWith('[')) {
                    return JSON.parse(text);
                }
            }
        } catch (e) {
            console.warn(`[SC Proxy] Proxy falló, intentando siguiente...`);
        }
    }
    throw new Error('Todos los proxies CORS fallaron.');
}
const DEFAULT_SONGS = []; // No default songs to avoid annoying "drums" or test tracks.

let songs = [];
let currentUser = null;
let currentPlaylistId = null;
let searchTerm = '';
let isDraggingProgress = false;

let currentSongIndex = 0;
let isPlaying = false;
let userWantsToPlay = false;
let isLoadingNewSong = false;
let editingSongId = null;
let isSelectMode = false;
let selectedSongIds = [];

// DOM Elements
const songGrid = document.getElementById('song-grid');
const addSongBtn = document.getElementById('add-song-btn');
const addSongModal = document.getElementById('add-song-modal');
const authModal = document.getElementById('auth-modal');
const closeModal = document.getElementById('close-modal');
const closeAuth = document.getElementById('close-auth');
const addSongForm = document.getElementById('add-song-form');
const authForm = document.getElementById('auth-form');
const authSwitch = document.getElementById('auth-switch');
const userProfileBtn = document.getElementById('user-profile-btn');
const userMenu = document.getElementById('user-menu');
const logoutBtn = document.getElementById('logout-btn');
const loginStatusText = document.getElementById('login-status-text');
const userAvatar = document.getElementById('user-avatar');

// Navigation elements
const navHome = document.getElementById('nav-home');
const navTrending = document.getElementById('nav-trending');
const navFavorites = document.getElementById('nav-favorites');
const navUploads = document.getElementById('nav-uploads');
const navPlaylists = document.getElementById('nav-playlists');

// Playlist elements
const newPlaylistBtn = document.getElementById('new-playlist-btn');
const playlistList = document.getElementById('playlist-list');
const playlistCardList = document.getElementById('playlist-card-list');
const addToPlaylistModal = document.getElementById('add-to-playlist-modal');
const playlistSelectorList = document.getElementById('playlist-selector-list');
const closePlaylistModal = document.getElementById('close-playlist-modal');
const closeAddToPlaylist = document.getElementById('close-add-to-playlist');
const playlistModal = document.getElementById('playlist-modal');
const playlistForm = document.getElementById('playlist-form');
const playlistItemsContainer = document.getElementById('playlist-items');

// Player elements
const playPauseBtn = document.getElementById('play-pause-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.querySelector('.current-time');
const totalTimeEl = document.querySelector('.total-time');
const volumeSlider = document.getElementById('volume-slider');
const playerStatus = document.getElementById('player-status');

// Bulk actions
const multiActionBar = document.getElementById('multi-action-bar');
const selectedCountEl = document.getElementById('selected-count');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const bulkFavBtn = document.getElementById('bulk-fav-btn');
const bulkPlaylistBtn = document.getElementById('bulk-playlist-btn');
const toggleSelectBtn = document.getElementById('toggle-select-mode');
const cancelSelectBtn = document.getElementById('cancel-select-btn');

// Other Shared Elements
const menuAddPlaylist = document.getElementById('menu-add-playlist');
const menuFavorite = document.getElementById('menu-favorite');
const bulkImportBtn = document.getElementById('bulk-import-btn');
const bulkImportModal = document.getElementById('bulk-import-modal');
const bulkUrlsArea = document.getElementById('bulk-urls');
const startBulkImportBtn = document.getElementById('start-bulk-import');
const closeBulkModal = document.getElementById('close-bulk-modal');
const importStatus = document.getElementById('import-status');
const importProgressText = document.getElementById('import-progress-text');
const importProgressBar = document.getElementById('import-progress-bar');

// Auth & Genres
const authConfirmPassword = document.getElementById('auth-confirm-password');
const genreModal = document.getElementById('genre-modal');
const genreGrid = document.getElementById('genre-grid');
const saveGenresBtn = document.getElementById('save-genres');

// Navigation & Sidebar
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebar = document.querySelector('.sidebar');
const searchInput = document.getElementById('search-input');

// Mobile Nav
const mobileNavHome = document.getElementById('mobile-nav-home');
const mobileNavAdd = document.getElementById('mobile-nav-add');
const mobileNavLibrary = document.getElementById('mobile-nav-library');
const mobileAddOverlay = document.getElementById('mobile-add-overlay');
const mobileLibOverlay = document.getElementById('mobile-library-overlay');
const mobAddSong = document.getElementById('mob-add-song');
const mobBulkImport = document.getElementById('mob-bulk-import');
const mobNewPlaylist = document.getElementById('mob-new-playlist');
const mobNavUploads = document.getElementById('mob-nav-uploads');
const mobNavFavorites = document.getElementById('mob-nav-favorites');
const mobNavPlaylists = document.getElementById('mob-nav-playlists');

function setStatus(msg) {
    if (playerStatus) playerStatus.textContent = `Player: ${msg}`;
    console.log(`[Status] ${msg}`);
}

function nextSong() {
    if (songs.length === 0) return;
    let nextIndex = (currentSongIndex + 1) % songs.length;
    playSong(nextIndex);
}

function prevSong() {
    if (songs.length === 0) return;
    let prevIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    playSong(prevIndex);
}

// Initialize
async function init() {
    console.log("Initializing Purelyd SC (Native Mode)...");

    // 1. Load session first
    const savedUser = localStorage.getItem('purelydsc-current-user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        if (loginStatusText) loginStatusText.textContent = currentUser.username;
        if (userAvatar) userAvatar.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`;
    }

    // 2. Setup UI and Handlers
    initMediaSessionHandlers();
    setupEventListeners();
    updateAuthUI();

    try {
        await loadUserSongs();
        await loadPlaylists();

        renderPlaylists();
        renderSongs();
        console.log("Data loaded successfully.");
    } catch (e) {
        console.warn("Data load failed, showing empty library:", e);
        songs = [];
        renderSongs();
    }
}

async function loadUserSongs() {
    if (currentUser) {
        if (currentPlaylistId === 'favorites') {
            // Refrescar el usuario desde Supabase para tener los favoritos actualizados
            try {
                const freshUser = await UserDB.getUser(currentUser.username);
                if (freshUser) {
                    currentUser.favorites = freshUser.favorites || [];
                    localStorage.setItem('purelydsc-current-user', JSON.stringify(currentUser));
                }
            } catch (e) {
                console.warn('[Favorites] No se pudo refrescar usuario desde Supabase:', e);
            }
            const allSongs = await SongDB.getAllSongs();
            const favIds = (currentUser.favorites || []).map(id => id.toString());
            songs = allSongs.filter(s => favIds.includes(s.id.toString()));
        } else if (currentPlaylistId === 'uploads') {
            songs = await SongDB.getSongsByUser(currentUser.username);
        } else if (currentPlaylistId) {
            songs = await PlaylistDB.getPlaylistSongs(currentPlaylistId);
        } else {
            // Home: Show all songs
            songs = await SongDB.getAllSongs();
            if (songs.length === 0) songs = [...DEFAULT_SONGS];
        }
    } else {
        songs = [...DEFAULT_SONGS];
    }
}

async function loadPlaylists() {
    if (currentUser) {
        playlists = await PlaylistDB.getPlaylistsByUser(currentUser.username);
    } else {
        playlists = [];
    }
}

function renderPlaylists() {
    if (!playlistItemsContainer) return;
    playlistItemsContainer.innerHTML = playlists.map(p => `
        <div class="playlist-item ${currentPlaylistId === p.id ? 'active' : ''}" data-id="${p.id}">
            <span>📁</span> ${p.name}
        </div>
    `).join('');

    document.querySelectorAll('.playlist-item').forEach(item => {
        item.onclick = async () => {
            currentPlaylistId = parseInt(item.dataset.id);
            navHome.classList.remove('active');
            navUploads.classList.remove('active');
            navFavorites.classList.remove('active');
            await loadUserSongs();
            renderSongs();
            renderPlaylists();
        };
    });
}

function updateAuthUI() {
    if (currentUser) {
        loginStatusText.textContent = currentUser.username;
        userAvatar.textContent = currentUser.username[0].toUpperCase();
    } else {
        loginStatusText.textContent = 'Log In';
        userAvatar.textContent = '?';
        isPlaying = false;
        if (scWidget && widgetReady) {
            scWidget.pause();
        }
    }
}

function renderSongs() {
    const mainHeading = document.querySelector('.content-area h1');
    if (mainHeading) {
        if (currentPlaylistId === 'favorites') mainHeading.textContent = 'Mis Favoritos';
        else if (currentPlaylistId === 'uploads') mainHeading.textContent = 'Subido por mí';
        else if (currentPlaylistId) {
            const p = playlists.find(p => p.id === currentPlaylistId);
            mainHeading.textContent = p ? p.name : 'Playlist';
        } else {
            mainHeading.textContent = searchTerm ? 'Resultados' : 'Purelyd SC';
        }
    }

    // HOME VIEW: Show action cards instead of all songs
    if (!currentPlaylistId && !searchTerm) {
        const playlistCards = playlists.map(p => `
            <div class="song-card home-action-card home-playlist-card" data-playlist-id="${p.id}" style="cursor:pointer;">
                <div class="song-cover" style="background: linear-gradient(135deg, #6C3483, #A569BD); display:flex; align-items:center; justify-content:center; font-size:2.5rem;">🎵</div>
                <div class="song-info">
                    <div class="song-title" style="font-size:1rem; font-weight:700;">${p.name}</div>
                    <div class="song-artist">${(p.song_ids || []).length} canciones</div>
                </div>
            </div>
        `).join('');

        songGrid.innerHTML = `
            <div class="song-card home-action-card" id="home-random" style="cursor:pointer;">
                <div class="song-cover" style="background: linear-gradient(135deg, #1DB954, #1ed760); display:flex; align-items:center; justify-content:center; font-size:3rem;">🎲</div>
                <div class="song-info">
                    <div class="song-title" style="font-size:1rem; font-weight:700;">Canción Aleatoria</div>
                    <div class="song-artist">Sorpréndete</div>
                </div>
            </div>

            <div class="song-card home-action-card" id="home-all" style="cursor:pointer;">
                <div class="song-cover" style="background: linear-gradient(135deg, #2196F3, #64B5F6); display:flex; align-items:center; justify-content:center; font-size:3rem;">&#128218;</div>
                <div class="song-info">
                    <div class="song-title" style="font-size:1rem; font-weight:700;">Ver Todas</div>
                    <div class="song-artist">Todas las canciones</div>
                </div>
            </div>
            <div class="song-card home-action-card" id="home-favorites" style="cursor:pointer;">
                <div class="song-cover" style="background: linear-gradient(135deg, #e91e63, #f06292); display:flex; align-items:center; justify-content:center; font-size:3rem;">❤️</div>
                <div class="song-info">
                    <div class="song-title" style="font-size:1rem; font-weight:700;">Favoritos</div>
                    <div class="song-artist">Tus canciones favoritas</div>
                </div>
            </div>
            ${playlistCards}
        `;

        // Build recommended section HTML
        let recoSection = "";
        let recommendedSongs = [];
        const userSongs = currentUser ? songs.filter(s => s.username === currentUser.username) : [];
        if (userSongs.length > 0) {
            const shuffled = [...userSongs].sort(() => Math.random() - 0.5).slice(0, 5);
            recommendedSongs = shuffled;
            recoSection = `
                <div style="grid-column: 1 / -1; margin-top: 20px;">
                    <h2 style="color: white; font-size: 1.3rem; margin-bottom: 12px;">&#127911; Recomendados</h2>
                </div>
            ` + shuffled.map((song, idx) => {
                const realIndex = songs.findIndex(s => s.id === song.id);
                return `
                <div class="song-card reco-card" data-reco-index="${idx}" style="cursor:pointer;">
                    <img src="${song.cover || getThumbnail(song)}" alt="${song.title}">
                    <div class="title">${song.title}</div>
                    <div class="artist">${song.artist}</div>
                </div>`;
            }).join("");
        }

        songGrid.innerHTML += recoSection;

        // Attach ALL click handlers AFTER DOM is finalized
        document.getElementById("home-random").onclick = () => {
            if (songs.length === 0) return;
            const randomIndex = Math.floor(Math.random() * songs.length);
            playSong(randomIndex);
        };
        document.getElementById("home-all").onclick = async () => {
            currentPlaylistId = null;
            searchTerm = ' ';
            await loadUserSongs();
            renderSongs();
            searchTerm = '';
        };
        document.querySelectorAll(".home-playlist-card").forEach(card => {
            card.onclick = async () => {
                currentPlaylistId = parseInt(card.dataset.playlistId);
                navHome.classList.remove("active");
                navUploads.classList.remove("active");
                navFavorites.classList.remove("active");
                await loadUserSongs();
                renderSongs();
                renderPlaylists();
            };
        });
        document.getElementById("home-favorites").onclick = () => {
            if (navFavorites) navFavorites.click();
        };
        songGrid.querySelectorAll(".reco-card").forEach(card => {
            card.onclick = async () => {
                const recoIdx = parseInt(card.dataset.recoIndex);
                const clickedSong = recommendedSongs[recoIdx];
                if (!clickedSong || !currentUser) return;

                // 1. Load all user uploads for the background queue WITHOUT changing view
                const allUserSongs = await SongDB.getSongsByUser(currentUser.username);

                // 2. Filter out recommended songs to avoid duplicates in the tail
                const recoIds = recommendedSongs.map(s => s.id);
                const restOfSongs = allUserSongs.filter(s => !recoIds.includes(s.id));

                // 3. Build sequence: [Clicked, then rest of recommended, then rest of user songs]
                const remainingRecommended = recommendedSongs.slice(recoIdx + 1);
                const precedingRecommended = recommendedSongs.slice(0, recoIdx);

                // Update global 'songs' array (the active queue)
                songs = [clickedSong, ...remainingRecommended, ...precedingRecommended, ...restOfSongs];

                // 4. Play immediately - UI stays on Home because currentPlaylistId remains null
                playSong(0);
            };
        });
        toggleSelectBtn.style.display = "none";
        if (isSelectMode) exitSelectMode();
        return;
    }

    // TRENDING VIEW
    if (currentPlaylistId === 'trending') {
        // We render a special grid for Trending
        const mainHeading = document.querySelector('.content-area h1');
        if (mainHeading) mainHeading.innerHTML = `🔥 Tendencias Top 40`;

        if (!songs || songs.length === 0) {
            songGrid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 50px; text-align: center; color: #888;">
                    <div style="font-size: 2rem; margin-bottom: 10px;" class="spinner">⏳</div>
                    <style>@keyframes spin { 100% { transform: rotate(360deg); } } .spinner { display: inline-block; animation: spin 1s linear infinite; }</style>
                    Cargando éxitos en vivo...
                </div>
            `;
            return;
        }

        const favIds = currentUser ? (currentUser.favorites || []) : [];
        songGrid.innerHTML = songs.map((song, index) => {
            const isFav = favIds.includes(song.id);
            // Rank counter
            const rank = index + 1;
            const rankColor = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : 'var(--text-secondary)';

            return `
            <div class="song-card" data-index="${index}">
                <div style="position: absolute; top: -10px; left: -10px; width: 30px; height: 30px; background: #222; color: ${rankColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem; z-index: 2; border: 2px solid #111; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
                    ${rank}
                </div>
                ${!isSelectMode ? `<button class="options-btn" data-index="${index}">⋮</button>` : ''}
                ${isFav ? `
                    <div class="fav-badge">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor"/>
                        </svg>
                    </div>
                ` : ''}
                <img src="${song.cover || getThumbnail(song)}" alt="${song.title}">
                <div class="title">${song.title}</div>
                <div class="artist">${song.artist}</div>
            </div>
        `}).join('');

        // Attach clicks
        document.querySelectorAll('.song-card').forEach(card => {
            card.onclick = (e) => {
                if (e.target.closest('.options-btn')) return;
                const index = parseInt(card.dataset.index);
                playSong(index);
            };
        });

        document.querySelectorAll('.options-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                showMenu(e, parseInt(btn.dataset.index));
            };
        });

        toggleSelectBtn.style.display = 'none';
        if (isSelectMode) exitSelectMode();
        return;
    }

    // SEARCH / PLAYLIST VIEW: Show songs
    const favIds = currentUser ? (currentUser.favorites || []) : [];

    const filteredSongs = (currentPlaylistId === 'search' || currentPlaylistId === 'trending') ? songs : songs.filter(song => {
        const query = searchTerm.toLowerCase();
        return song.title.toLowerCase().includes(query) ||
            song.artist.toLowerCase().includes(query);
    });

    songGrid.innerHTML = filteredSongs.map((song, index) => {
        const isFav = favIds.includes(song.id);
        const isSelected = selectedSongIds.includes(song.id);
        // We need to find the REAL index in the 'songs' array for playSong(index)
        const realIndex = songs.findIndex(s => s.id === song.id);
        return `
        <div class="song-card ${isSelected ? 'selected' : ''}" data-index="${realIndex}">
            ${!isSelectMode ? `<button class="options-btn" data-index="${realIndex}">⋮</button>` : ''}
            ${isFav ? `
                <div class="fav-badge">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor"/>
                    </svg>
                </div>
            ` : ''}
            <img src="${song.cover || getThumbnail(song)}" alt="${song.title}">
            <div class="title">${song.title}</div>
            <div class="artist">${song.artist}</div>
        </div>
    `}).join('');

    // Update Select Button visibility
    if (currentPlaylistId === 'uploads' && currentUser) {
        toggleSelectBtn.style.display = 'block';
    } else {
        toggleSelectBtn.style.display = 'none';
        if (isSelectMode) exitSelectMode();
    }

    // Re-attach card clicks
    document.querySelectorAll('.song-card').forEach(card => {
        card.onclick = (e) => {
            if (e.target.closest('.options-btn')) return;
            const index = parseInt(card.dataset.index);
            const song = songs[index];

            if (isSelectMode) {
                toggleSongSelection(song.id);
            } else {
                playSong(index);
            }
        };
    });

    // Re-attach menu clicks
    document.querySelectorAll('.options-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showMenu(e, parseInt(btn.dataset.index));
        };
    });
}

function getThumbnail(song) {
    if (song.cover) return song.cover;
    return 'https://via.placeholder.com/300';
}

function getSCId(songIdOrUrl) {
    if (!songIdOrUrl) return null;
    if (songIdOrUrl.toString().startsWith("sc-")) {
        return songIdOrUrl.split("-")[1];
    }
    return songIdOrUrl;
}

function mapSCTrackToPurelyd(track) {
    return {
        id: 'sc-' + track.id,
        title: track.title || "Unknown Title",
        artist: track.user?.username || "SoundCloud User",
        url: track.permalink_url, // Vital for the new Widget API
        cover: track.artwork_url ? track.artwork_url.replace('large', 't500x500') : (track.user?.avatar_url || ""),
        type: 'soundcloud',
        durationMs: track.duration,
        streamable: track.streamable
    };
}

// 🚀 AUTO-MIGRATION: Fetch SC match for old YT titles
async function fetchSCReplacement(title) {
    if (!title) return null;
    try {
        const apiPath = `/search/tracks?q=${encodeURIComponent(title)}&limit=5`;
        const data = await fetchSCApi(apiPath);
        const tracks = Array.isArray(data) ? data : (data.collection || []);
        const validTracks = tracks.filter(t => t.kind === 'track' && t.streamable);
        if (validTracks.length > 0) {
            return mapSCTrackToPurelyd(validTracks[0]);
        }
    } catch (e) {
        console.warn(`[Auto-Migration] Failed to find SC match for: ${title}`);
    }
    return null;
}

function setupEventListeners() {
    // Search Listener - Use 'Enter' key to search SC API
    searchInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchTerm = searchInput.value.trim();
            if (!searchTerm) {
                currentPlaylistId = null;
                await loadUserSongs();
                renderSongs();
                return;
            }

            const mainHeading = document.querySelector('.content-area h1');
            if (mainHeading) mainHeading.innerHTML = `Buscando: <span style="font-weight:400; opacity:0.8;">${searchTerm}</span>...`;

            try {
                // Usando proxy CORS con fallback automático
                const apiPath = `/search/tracks?q=${encodeURIComponent(searchTerm)}&limit=20`;
                const data = await fetchSCApi(apiPath);
                const tracks = Array.isArray(data) ? data : (data.collection || []);
                const validTracks = tracks.filter(t => t.kind === 'track' && t.streamable);

                currentPlaylistId = 'search';
                songs = validTracks.map(mapSCTrackToPurelyd);
                renderSongs();
                if (mainHeading) mainHeading.innerHTML = `Resultados para: <span style="font-weight:400; opacity:0.8;">${searchTerm}</span>`;
                return;
            } catch (err) {
                console.error("Search error:", err);
                if (mainHeading) mainHeading.textContent = "Error en la búsqueda. Inténtalo de nuevo.";
            }
        }
    });

    searchInput.oninput = (e) => {
        // We only live-filter if they clear it or if they are in their library
        if (e.target.value === '') {
            searchTerm = '';
            currentPlaylistId = null;
            loadUserSongs().then(renderSongs);
        }
    };

    // Mobile Bottom Nav Handlers
    mobileNavHome.onclick = () => {
        currentPlaylistId = null;
        loadUserSongs();
        renderSongs();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    mobileNavAdd.onclick = () => {
        mobileAddOverlay.classList.toggle('active');
        mobileLibOverlay.classList.remove('active');
    };

    mobileNavLibrary.onclick = () => {
        mobileLibOverlay.classList.toggle('active');
        mobileAddOverlay.classList.remove('active');
    };

    // Overlay Item Click Handlers
    mobAddSong.onclick = () => {
        addSongBtn.click();
        mobileAddOverlay.classList.remove('active');
    };

    mobBulkImport.onclick = () => {
        bulkImportBtn.click();
        mobileAddOverlay.classList.remove('active');
    };

    mobNewPlaylist.onclick = () => {
        newPlaylistBtn.click();
        mobileAddOverlay.classList.remove('active');
    };

    mobNavUploads.onclick = () => {
        navUploads.click();
        mobileLibOverlay.classList.remove('active');
    };

    mobNavFavorites.onclick = () => {
        navFavorites.click();
        mobileLibOverlay.classList.remove('active');
    };

    mobNavPlaylists.onclick = async () => {
        mobileLibOverlay.classList.remove('active');
        if (!currentUser) return showAuthModal();
        await loadPlaylists();
        if (playlists.length === 0) {
            alert('No tienes playlists. ¡Crea una primero!');
            return;
        }
        // Show playlists in the main content area
        const mainHeading = document.querySelector('.content-area h1');
        if (mainHeading) mainHeading.textContent = 'Mis Playlists';
        songGrid.innerHTML = playlists.map(p => `
            <div class="song-card" data-playlist-id="${p.id}" style="cursor:pointer;">
                <div class="song-cover" style="background: linear-gradient(135deg, #ff6600, #ff9933); display:flex; align-items:center; justify-content:center; font-size:2.5rem;">📁</div>
                <div class="song-info">
                    <div class="song-title">${p.name}</div>
                    <div class="song-artist">${(p.songIds || []).length} canciones</div>
                </div>
            </div>
        `).join('') + `
            <div class="song-card" id="mobile-back-home" style="cursor:pointer;">
                <div class="song-cover" style="background: rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:2.5rem;">←</div>
                <div class="song-info">
                    <div class="song-title">Volver al inicio</div>
                    <div class="song-artist">Ver todas las canciones</div>
                </div>
            </div>
        `;
        // Attach click handlers for each playlist card
        document.querySelectorAll('[data-playlist-id]').forEach(card => {
            card.onclick = async () => {
                currentPlaylistId = parseInt(card.dataset.playlistId);
                navHome.classList.remove('active');
                navUploads.classList.remove('active');
                navFavorites.classList.remove('active');
                await loadUserSongs();
                renderSongs();
                renderPlaylists();
            };
        });
        // Back to home handler
        const backBtn = document.getElementById('mobile-back-home');
        if (backBtn) backBtn.onclick = () => navHome.click();
    };

    // Close overlays when clicking close or outside (the overlay itself is the backdrop)
    document.querySelectorAll('.sheet-close, .nav-sheet').forEach(el => {
        el.onclick = (e) => {
            if (e.target === el || el.classList.contains('sheet-close')) {
                mobileAddOverlay.classList.remove('active');
                mobileLibOverlay.classList.remove('active');
            }
        };
    });

    // Navigation Handlers
    navHome.onclick = async (e) => {
        if (e) e.preventDefault();
        currentPlaylistId = null;
        navHome.classList.add('active');
        navUploads.classList.remove('active');
        navFavorites.classList.remove('active');
        if (navTrending) navTrending.classList.remove('active');
        await loadUserSongs();
        renderSongs();
        renderPlaylists();
    };

    const navTrending = document.getElementById('nav-trending');
    if (navTrending) {
        navTrending.onclick = async (e) => {
            e.preventDefault();
            currentPlaylistId = 'trending';
            navTrending.classList.add('active');
            navHome.classList.remove('active');
            navUploads.classList.remove('active');
            navFavorites.classList.remove('active');
            // Show loading spinner immediately
            songs = [];
            renderSongs();

            try {
                // Determine user's top genre if possible, or fallback to pop/hiphop
                const genre = (currentUser && currentUser.genres && currentUser.genres.length > 0) ? currentUser.genres[0] : 'pop,hiphop,electronic';
                const tags = encodeURIComponent(genre || 'pop,hiphop,electronic,reggaeton');
                const apiPath = `/search/tracks?q=${tags}&limit=40`;
                const data = await fetchSCApi(apiPath);
                let tracks = (Array.isArray(data) ? data : (data.collection || [])).filter(t => t.kind === 'track' && t.streamable);
                tracks.sort((a, b) => (b.playback_count || 0) - (a.playback_count || 0));
                songs = tracks.map(mapSCTrackToPurelyd);
            } catch (err) {
                console.error("Error fetching trending list:", err);
            }
            // Check if user is still on trending view before re-rendering
            if (currentPlaylistId === 'trending') {
                renderSongs();
            }
        };
    }

    navUploads.onclick = async (e) => {
        e.preventDefault();
        if (!currentUser) return showAuthModal();
        currentPlaylistId = 'uploads';
        navUploads.classList.add('active');
        navHome.classList.remove('active');
        navFavorites.classList.remove('active');
        if (navTrending) navTrending.classList.remove('active');
        await loadUserSongs();
        renderSongs();
        renderPlaylists();
    };

    navFavorites.onclick = async (e) => {
        e.preventDefault();
        if (!currentUser) return showAuthModal();
        currentPlaylistId = 'favorites';
        navFavorites.classList.add('active');
        navHome.classList.remove('active');
        navUploads.classList.remove('active');
        if (navTrending) navTrending.classList.remove('active');
        await loadUserSongs();
        renderSongs();
        renderPlaylists();
    };

    newPlaylistBtn.onclick = () => {
        if (!currentUser) return alert('Debes iniciar sesión para crear playlists.');
        playlistModal.style.display = 'flex';
    };

    closePlaylistModal.onclick = () => playlistModal.style.display = 'none';

    playlistForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('playlist-name').value;
        try {
            await PlaylistDB.addPlaylist({
                name,
                username: currentUser.username,
                song_ids: []
            });
            playlistModal.style.display = 'none';
            playlistForm.reset();
            await loadPlaylists();
            renderPlaylists();
            alert('Playlist "' + name + '" creada!');
        } catch (err) {
            console.error('Error creating playlist:', err);
            alert('Error al crear la playlist: ' + err.message);
        }
    };

    menuAddPlaylist.onclick = () => {
        if (menuTargetIndex === null) return;
        const song = songs[menuTargetIndex];
        showAddToPlaylistModal(song.id);
        hideMenu();
    };

    menuFavorite.onclick = async () => {
        if (menuTargetIndex === null || !currentUser) return;
        const song = songs[menuTargetIndex];

        const isCurrentlyFav = (currentUser.favorites || []).map(id => id.toString()).includes(song.id.toString());

        // Si se va a AÑADIR como favorito, guardar primero la canción en la BD
        if (!isCurrentlyFav) {
            try {
                await SongDB.addSong({ ...song, username: currentUser.username }, currentUser.username);
            } catch (e) {
                console.warn('[Favorites] No se pudo guardar la canción en sc_songs:', e);
            }
        }

        const newFavs = await UserDB.toggleFavorite(currentUser.username, song.id);
        currentUser.favorites = newFavs;
        localStorage.setItem('purelydsc-current-user', JSON.stringify(currentUser));

        hideMenu();
        renderSongs(); // Always re-render to show/hide heart icon immediately

    };

    // Multi-select handlers
    toggleSelectBtn.onclick = toggleSelectMode;
    cancelSelectBtn.onclick = exitSelectMode;
    bulkDeleteBtn.onclick = bulkDelete;
    bulkFavBtn.onclick = bulkFavorite;
    bulkPlaylistBtn.onclick = bulkAddToPlaylist;

    async function showAddToPlaylistModal(songId) {
        const userPlaylists = await PlaylistDB.getPlaylistsByUser(currentUser.username);
        playlistSelectorList.innerHTML = userPlaylists.map(p => `
            <div class="selector-item" data-id="${p.id}">${p.name}</div>
        `).join('');

        document.querySelectorAll('.selector-item').forEach(item => {
            item.onclick = async () => {
                await PlaylistDB.addSongToPlaylist(parseInt(item.dataset.id), songId);
                alert('Canción añadida!');
                addToPlaylistModal.style.display = 'none';
            };
        });

        addToPlaylistModal.style.display = 'flex';
    }

    closeAddToPlaylist.onclick = () => addToPlaylistModal.style.display = 'none';

    // Helper to close specific mobile elements
    function closeSidebarMobile() {
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        }
    }

    // Add closeSidebarMobile to navigation clicks
    document.querySelectorAll('.nav-links a, #playlist-items').forEach(el => {
        const oldClick = el.onclick;
        el.addEventListener('click', () => closeSidebarMobile());
    });

    // Bulk Import Logic
    bulkImportBtn.onclick = () => {
        if (!currentUser) return showAuthModal();
        bulkImportModal.style.display = 'flex';
        importStatus.style.display = 'none';
        bulkUrlsArea.value = '';
    };

    closeBulkModal.onclick = () => {
        bulkImportModal.style.display = 'none';
    };

    startBulkImportBtn.onclick = async () => {
        const text = bulkUrlsArea.value.trim();
        if (!text) return alert('Por favor, pega algunos enlaces.');

        let lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return;

        startBulkImportBtn.disabled = true;
        importStatus.style.display = 'block';
        let importedCount = 0;

        // Detection: Is it a playlist?
        if (lines.length === 1 && lines[0].includes('sets/')) {
            importProgressText.textContent = `Resolviendo playlist de SoundCloud...`;

            try {
                const apiPath = `/resolve?url=${encodeURIComponent(lines[0])}`;
                const data = await fetchSCApi(apiPath);

                if (data && data.kind === 'playlist' && data.tracks) {
                    lines = data.tracks.map(t => t.permalink_url);
                    console.log(`Extraction successful: ${lines.length} songs found.`);
                } else {
                    throw new Error("No se encontraron canciones o no es una playlist válida.");
                }
            } catch (e) {
                alert("Error al extraer la playlist. Intenta asegurarte de que el enlace sea público.");
                console.error("Playlist extraction error:", e);
                startBulkImportBtn.disabled = false;
                return;
            }
        }

        for (let i = 0; i < lines.length; i++) {
            const url = lines[i];

            importProgressText.textContent = `Procesando ${i + 1} de ${lines.length}...`;
            importProgressBar.style.width = `${((i + 1) / lines.length) * 100}%`;

            try {
                const apiPath = `/resolve?url=${encodeURIComponent(url)}`;
                const trackData = await fetchSCApi(apiPath);
                if (trackData && trackData.kind === 'track') {
                    const track = mapSCTrackToPurelyd(trackData);
                    const newSong = {
                        id: Date.now() + Math.random(),
                        title: track.title,
                        artist: track.artist,
                        url: track.url,
                        cover: track.cover,
                        type: 'soundcloud',
                        durationMs: track.durationMs
                    };
                    await SongDB.addSong(newSong, currentUser.username);
                    importedCount++;
                }
            } catch (e) {
                console.error("Error importing:", url, e);
            }
        }

        alert(`¡Importación completada! Se añadieron ${importedCount} canciones.`);
        startBulkImportBtn.disabled = false;
        bulkImportModal.style.display = 'none';
        await loadUserSongs();
        renderSongs();
    };

    addSongBtn.onclick = () => {
        if (!currentUser) return showAuthModal();
        addSongModal.style.display = 'flex';
    };

    // Auto-fill SoundCloud Metadata
    const songUrlInput = document.getElementById('song-url');
    const songTitleInput = document.getElementById('song-title');
    const songArtistInput = document.getElementById('song-artist');
    const songCoverInput = document.getElementById('song-cover');

    songUrlInput.oninput = async () => {
        const url = songUrlInput.value.trim();

        if (url.includes('soundcloud.com')) {
            console.log("Resolving SC metadata for:", url);
            try {
                const apiPath = `/resolve?url=${encodeURIComponent(url)}`;
                const trackData = await fetchSCApi(apiPath);
                if (trackData && trackData.kind === 'track') {
                    const track = mapSCTrackToPurelyd(trackData);
                    songTitleInput.value = track.title;
                    songArtistInput.value = track.artist;
                    if (track.cover && track.cover.trim() !== "") {
                        songCoverInput.value = track.cover;
                    }
                    console.log("Metadata auto-filled");
                }
            } catch (e) {
                console.warn("Failed to fetch SC metadata:", e);
            }
        }
    };

    closeModal.onclick = () => {
        addSongModal.style.display = 'none';
        addSongForm.reset();
    };

    userProfileBtn.onclick = (e) => {
        e.stopPropagation();
        if (!currentUser) {
            showAuthModal();
        } else {
            userMenu.classList.toggle('active');
        }
    };

    logoutBtn.onclick = () => {
        currentUser = null;
        localStorage.removeItem('purelydsc-current-user');
        userMenu.classList.remove('active');
        init();
    };

    let isRegisterMode = false;
    function showAuthModal() {
        isRegisterMode = false;
        updateAuthModalUI();
        authModal.style.display = 'flex';
    }

    function updateAuthModalUI() {
        document.getElementById('auth-title').textContent = isRegisterMode ? 'Register' : 'Log In';
        document.getElementById('auth-submit').textContent = isRegisterMode ? 'Register' : 'Log In';

        // Use innerHTML to safely reconstruct the switch text and the span button
        if (isRegisterMode) {
            authSwitch.innerHTML = 'Already have an account? <span>Log In</span>';
        } else {
            authSwitch.innerHTML = "Don't have an account? <span>Register</span>";
        }

        // Toggle new fields
        authConfirmPassword.style.display = isRegisterMode ? 'block' : 'none';
        authConfirmPassword.required = isRegisterMode;
    }

    // Use event delegation for the switch since its innerHTML gets replaced
    authSwitch.onclick = (e) => {
        if (e.target.tagName === 'SPAN') {
            isRegisterMode = !isRegisterMode;
            updateAuthModalUI();
        }
    };

    closeAuth.onclick = () => authModal.style.display = 'none';

    authForm.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value.trim();
        const confirmPassword = authConfirmPassword.value.trim();

        console.log(`Auth attempt: ${isRegisterMode ? 'Register' : 'Login'} for ${username}`);

        try {
            if (isRegisterMode) {
                if (password !== confirmPassword) {
                    return alert('Las contraseñas no coinciden.');
                }
                if (await UserDB.getUser(username)) {
                    return alert('Ese nombre de usuario ya existe.');
                }

                // Temporary user object to start onboarding
                const newUser = { username, password, genres: [] };
                await UserDB.addUser(newUser);
                users = await UserDB.getAllUsers();
                currentUser = newUser;

                authModal.style.display = 'none';
                authForm.reset();
                showGenreSelection();
            } else {
                const user = await UserDB.getUser(username);
                if (!user || user.password !== password) {
                    console.warn("Invalid credentials");
                    return alert('Usuario o contraseña incorrectos.');
                }
                currentUser = user;
                localStorage.setItem('purelydsc-current-user', JSON.stringify(currentUser));
                authModal.style.display = 'none';
                authForm.reset();
                await init();
            }
        } catch (err) {
            console.error("Auth Error:", err);
            alert(`Error inesperado durante la autenticación:\n\n${err.message || err.details || err}\n\nPor favor, contacta con soporte o revisa la consola.`);
        }
    };

    const MUSIC_GENRES = ['Pop', 'Rock', 'Electronic', 'Hip Hop', 'Jazz', 'Classical', 'Reggaeton', 'Indie', 'Metal', 'Lo-fi', 'R&B', 'Country'];
    let selectedGenres = [];

    function showGenreSelection() {
        selectedGenres = [];
        genreGrid.innerHTML = MUSIC_GENRES.map(genre => `
            <div class="genre-chip" data-genre="${genre}">${genre}</div>
        `).join('');

        document.querySelectorAll('.genre-chip').forEach(chip => {
            chip.onclick = () => {
                const genre = chip.dataset.genre;
                if (selectedGenres.includes(genre)) {
                    selectedGenres = selectedGenres.filter(g => g !== genre);
                    chip.classList.remove('selected');
                } else if (selectedGenres.length < 3) {
                    selectedGenres.push(genre);
                    chip.classList.add('selected');
                } else {
                    alert('Solo puedes elegir hasta 3 gï¿½neros.');
                }
            };
        });

        genreModal.style.display = 'flex';
    }

    saveGenresBtn.onclick = async () => {
        if (selectedGenres.length === 0) {
            return alert('Por favor, elige al menos un gï¿½nero.');
        }

        currentUser.genres = selectedGenres;
        // Update user in DB
        await UserDB.updateUser(currentUser);

        localStorage.setItem('purelydsc-current-user', JSON.stringify(currentUser));
        genreModal.style.display = 'none';
        await init();
    };

    addSongForm.onsubmit = async (e) => {
        e.preventDefault();
        const url = document.getElementById('song-url').value;
        const scId = getSCId(url);

        const songData = {
            title: document.getElementById('song-title').value,
            artist: document.getElementById('song-artist').value,
            url: url,
            cover: document.getElementById('song-cover').value,
            type: scId ? 'soundcloud' : 'audio'
        };

        if (editingSongId) {
            const index = songs.findIndex(s => s.id === editingSongId);
            if (index !== -1) {
                const updatedSong = { ...songs[index], ...songData };
                await SongDB.updateSong(updatedSong);
            }
            editingSongId = null;
        } else {
            const newSong = {
                id: Date.now(),
                ...songData
            };
            await SongDB.addSong(newSong, currentUser.username);
        }

        await loadUserSongs();
        renderSongs();
        addSongModal.style.display = 'none';
        addSongForm.reset();
        document.querySelector('#add-song-modal h2').textContent = 'Add New Song';
    };

    playPauseBtn.onclick = togglePlay;

    progressBar.onmousedown = () => isDraggingProgress = true;
    progressBar.ontouchstart = () => isDraggingProgress = true;

    progressBar.onchange = () => {
        const audioElement = document.getElementById('audio-element');
        if (audioElement && audioElement.duration > 0) {
            const newTime = (progressBar.value / 100) * audioElement.duration;
            audioElement.currentTime = newTime;
        }
        isDraggingProgress = false;
    };

    progressBar.onmouseup = () => isDraggingProgress = false;
    progressBar.ontouchend = () => isDraggingProgress = false;

    // Remove the old oninput logic because it fires continuously while dragging
    // and fights with ontimeupdate. onchange fires when drag completes.


    volumeSlider.oninput = () => {
        const vol = volumeSlider.value;
        const audioElement = document.getElementById('audio-element');
        if (audioElement) {
            audioElement.volume = vol / 100;
        }
    };

    window.onclick = (e) => {
        // 1. Modal handling
        if (e.target == addSongModal) {
            addSongModal.style.display = 'none';
            editingSongId = null;
            addSongForm.reset();
        }
        if (e.target == authModal) {
            authModal.style.display = 'none';
        }

        // 2. Context Menu handling
        if (!e.target.closest('.options-btn') && !e.target.closest('.context-menu')) {
            hideMenu();
        }

        // 3. User Menu handling
        if (!e.target.closest('.user-profile')) {
            userMenu.classList.remove('active');
        }
    };

    // Context Menu Event Listeners
    document.getElementById('menu-delete').onclick = async () => {
        if (menuTargetIndex !== null) {
            await deleteSongById(songs[menuTargetIndex].id);
            hideMenu();
        }
    };

    document.getElementById('menu-edit').onclick = () => {
        if (menuTargetIndex !== null) {
            openEditModal(menuTargetIndex);
            hideMenu();
        }
    };

    document.getElementById('next-btn').onclick = nextSong;
    document.getElementById('prev-btn').onclick = prevSong;

    // Setup Local Audio Element as THE ONLY ENGINE
    const audioElement = document.getElementById('audio-element');
    // Para móvil, asegurarnos de que el audio puede reproducirse cross-origin
    if (audioElement) {
        audioElement.onplay = () => {
            isPlaying = true;
            userWantsToPlay = true;
            playPauseBtn.textContent = '⏸';
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            startKeepAlive();
        };
        audioElement.onpause = () => {
            isPlaying = false;
            playPauseBtn.textContent = '▶';
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            stopKeepAlive();
        };
        audioElement.onended = () => nextSong();
        audioElement.ontimeupdate = () => {
            if (audioElement.duration > 0) {
                // UI Updates (only if not scrubbing manually)
                if (!isDraggingProgress) {
                    progressBar.value = (audioElement.currentTime / audioElement.duration) * 100;
                    currentTimeEl.textContent = formatTime(audioElement.currentTime);
                }
                totalTimeEl.textContent = formatTime(audioElement.duration);

                // MediaSession Throttling for native audio
                const now = Date.now();
                if (!window._lastMSUpdate || now - window._lastMSUpdate > 2000) {
                    try {
                        if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
                            navigator.mediaSession.setPositionState({
                                duration: audioElement.duration,
                                playbackRate: 1,
                                position: audioElement.currentTime
                            });
                        }
                        window._lastMSUpdate = now;
                    } catch (e) { }
                }
            }
        };
    }
}

let menuTargetIndex = null;

function showMenu(event, index) {
    if (!event) return;
    menuTargetIndex = index;
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    menu.style.display = 'block';
    if (currentUser && songs[index]) {
        const isFav = (currentUser.favorites || []).includes(songs[index].id);
        const favBtn = document.getElementById('menu-favorite');
        if (favBtn) favBtn.textContent = isFav ? "Quitar de Favoritos" : "Añadir a Favoritos";
    }

    const menuWidth = 160;
    let x = event.clientX;
    let y = event.clientY;
    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

function hideMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.style.display = 'none';
}


async function deleteSongById(id) {
    if (confirm(`¿Seguro que quieres eliminar esta canción?`)) {
        await SongDB.deleteSong(id);
        await loadUserSongs();
        renderSongs();
    }
}

function openEditModal(index) {
    const song = songs[index];
    editingSongId = song.id;
    document.getElementById('song-title').value = song.title;
    document.getElementById('song-artist').value = song.artist;
    document.getElementById('song-url').value = song.url;
    document.getElementById('song-cover').value = song.cover || '';
    document.querySelector('#add-song-modal h2').textContent = 'Editar Canción';
    addSongModal.style.display = 'flex';
}

// Selection Mode Helpers
function toggleSelectMode() {
    isSelectMode = !isSelectMode;
    selectedSongIds = [];
    if (!isSelectMode) {
        multiActionBar.style.display = 'none';
        toggleSelectBtn.textContent = 'Seleccionar';
    } else {
        multiActionBar.style.display = 'flex';
        toggleSelectBtn.textContent = 'Salir Selección';
        updateMultiBar();
    }
    renderSongs();
}

function exitSelectMode() {
    isSelectMode = false;
    selectedSongIds = [];
    multiActionBar.style.display = 'none';
    toggleSelectBtn.textContent = 'Seleccionar';
    renderSongs();
}

function toggleSongSelection(songId) {
    const index = selectedSongIds.indexOf(songId);
    if (index === -1) {
        selectedSongIds.push(songId);
    } else {
        selectedSongIds.splice(index, 1);
    }
    updateMultiBar();
    renderSongs();
}

function updateMultiBar() {
    selectedCountEl.textContent = `${selectedSongIds.length} seleccionados`;
}

async function bulkDelete() {
    if (selectedSongIds.length === 0) return;
    if (!confirm(`¿Estás seguro de que quieres eliminar ${selectedSongIds.length} canciones?`)) return;

    for (const id of selectedSongIds) {
        await SongDB.deleteSong(id);
    }
    alert(`${selectedSongIds.length} canciones eliminadas.`);
    exitSelectMode();
    await loadUserSongs();
    renderSongs();
}

async function bulkFavorite() {
    if (selectedSongIds.length === 0 || !currentUser) return;

    for (const id of selectedSongIds) {
        const newFavs = await UserDB.toggleFavorite(currentUser.username, id);
        currentUser.favorites = newFavs;
    }
    localStorage.setItem('purelydsc-current-user', JSON.stringify(currentUser));
    alert('Favoritos actualizados.');
    exitSelectMode();
    renderSongs();
}

async function bulkAddToPlaylist() {
    if (selectedSongIds.length === 0 || !currentUser) return;

    const userPlaylists = await PlaylistDB.getPlaylistsByUser(currentUser.username);
    if (userPlaylists.length === 0) return alert('No tienes playlists. Crea una primero.');

    playlistSelectorList.innerHTML = userPlaylists.map(p => `
        <div class="selector-item" data-id="${p.id}">${p.name}</div>
    `).join('');

    addToPlaylistModal.style.display = 'flex';

    document.querySelectorAll('.selector-item').forEach(item => {
        item.onclick = async () => {
            const pid = parseInt(item.dataset.id);
            for (const sid of selectedSongIds) {
                await PlaylistDB.addSongToPlaylist(pid, sid);
            }
            alert('Canciones añadidas a la playlist!');
            addToPlaylistModal.style.display = 'none';
            exitSelectMode();
        };
    });
}

// Convierte ms o segundos a formato mm:ss
function formatTime(secs) {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}


// Utility to export all songs for GitHub deployment
async function exportAllSongs() {
    const allSongs = await SongDB.getAllSongs();
    console.log("--- COPIA ESTO Y Pï¿½SAME ---");
    console.log(JSON.stringify(allSongs, null, 2));
    console.log("-------------------------------");
    alert("Lista de canciones exportada a la consola (F12). Copiamela para incluirla en el despliegue.");
}

async function playSong(index) {
    if (index < 0 || index >= songs.length) return;
    currentSongIndex = index;
    const song = songs[index];
    if (!song) return;

    // Update UI
    const songNameEl = document.querySelector('.player-song-info .song-name');
    const artistNameEl = document.querySelector('.player-song-info .artist-name');
    const playerCoverEl = document.querySelector('.player-cover');

    if (songNameEl) songNameEl.textContent = song.title;
    if (artistNameEl) artistNameEl.textContent = song.artist || 'Unknown Artist';

    const cover = song.cover || getThumbnail(song);
    if (playerCoverEl) {
        playerCoverEl.style.backgroundImage = `url(${cover})`;
        playerCoverEl.style.backgroundSize = 'cover';
    }

    setStatus(`▶ ${song.title}`);

    const localAudio = document.getElementById('audio-element');
    if (!localAudio) return;

    // Stop current playback
    localAudio.pause();
    localAudio.src = "";

    const isDirectAudio = song.type === 'audio' || song.url.includes('.mp3') || song.url.includes('.wav') || song.url.includes('googleusercontent');

    if (isDirectAudio) {
        localAudio.src = song.url;
        localAudio.play().catch(e => {
            console.error("Audio playback failed:", e);
            setStatus("Error playing audio file");
        });
        updateMediaSession(song);
    } else {
        // RESOLVER STREAM DE SOUNDCLOUD (MODO NATIVO)
        setStatus('Resolviendo stream...');
        isLoadingNewSong = true;

        try {
            let trackId = song.id;
            if (typeof trackId === 'string' && trackId.startsWith('sc-')) {
                trackId = trackId.substring(3);
            }

            let mp3StreamUrl = null;
            // Intento 1: API v2 Transcodings
            try {
                const data = await fetchSCApi(`/tracks/${trackId}`);
                if (data && data.media && data.media.transcodings) {
                    const prog = data.media.transcodings.find(t => t.format.protocol === 'progressive');
                    if (prog && prog.url) {
                        const streamData = await fetchSCApi(prog.url, true);
                        if (streamData && streamData.url) mp3StreamUrl = streamData.url;
                    }
                }
            } catch (e) { console.warn("[SC] v2 failed", e); }

            // Intento 2: API v1 fallback
            if (!mp3StreamUrl) {
                try {
                    const fb = await fetchSCApi(`/tracks/${trackId}/stream`);
                    if (fb && fb.http_mp3_128_url) mp3StreamUrl = fb.http_mp3_128_url;
                } catch (e) { console.warn("[SC] v1 failed", e); }
            }

            // Intento 3: Direct URL
            if (!mp3StreamUrl) {
                mp3StreamUrl = `https://api.soundcloud.com/tracks/${trackId}/stream?client_id=${SC_CLIENT_ID}`;
            }

            if (!mp3StreamUrl) throw new Error("No stream URL");

            localAudio.src = mp3StreamUrl;
            localAudio.play().catch(err => {
                console.error("[SC] Play blocked:", err);
                setStatus("Play bloqueado. Pulsa ▶");
            });

            isLoadingNewSong = false;
            updateMediaSession(song);
        } catch (error) {
            console.error("[SC Error]:", error);
            setStatus("Error cargando canción.");
            isLoadingNewSong = false;
        }
    }
}

function updateMediaSession(song) {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: 'Purelyd SC',
        artwork: [
            { src: song.cover || getThumbnail(song), sizes: '512x512', type: 'image/png' }
        ]
    });

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    if ('setPositionState' in navigator.mediaSession && song.durationMs) {
        navigator.mediaSession.setPositionState({
            duration: song.durationMs / 1000,
            playbackRate: isPlaying ? 1 : 0,
            position: 0
        });
    }
}

function initMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    const audioElement = document.getElementById('audio-element');

    const handlers = {
        'play': () => {
            userWantsToPlay = true;
            startKeepAlive();
            if (audioElement) audioElement.play();
        },
        'pause': () => {
            userWantsToPlay = false;
            if (audioElement) audioElement.pause();
        },
        'previoustrack': () => prevSong(),
        'nexttrack': () => nextSong(),
        'seekbackward': (details) => {
            seekRelative(-(details.seekOffset || 10));
        },
        'seekforward': (details) => {
            seekRelative(details.seekOffset || 10);
        },
        'seekto': (details) => {
            seekToTime(details.seekTime);
        }
    };

    for (const [action, handler] of Object.entries(handlers)) {
        try {
            navigator.mediaSession.setActionHandler(action, handler);
        } catch (error) {
            console.warn(`The media session action "${action}" is not supported yet.`);
        }
    }
}

function updateMediaSessionPositionState(currentSec, durationSec) {
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
        if (durationSec > 0 && currentSec !== undefined) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: durationSec,
                    playbackRate: isPlaying ? 1 : 0,
                    position: Math.min(currentSec, durationSec)
                });
            } catch (e) {
                console.warn("Error updating position state:", e);
            }
        }
    }
}

function seekRelative(offsetSec) {
    const audioElement = document.getElementById('audio-element');
    if (!audioElement) return;
    audioElement.currentTime = Math.max(0, Math.min(audioElement.duration, audioElement.currentTime + offsetSec));
}

function seekToTime(timeSec) {
    const audioElement = document.getElementById('audio-element');
    if (!audioElement) return;
    audioElement.currentTime = Math.max(0, Math.min(audioElement.duration, timeSec));
}


// Background Keep-Alive Logic
const silentAudio = document.getElementById('silent-audio');
const SILENT_TRACK = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

function startKeepAlive() {
    if (silentAudio) {
        if (silentAudio.src !== SILENT_TRACK) {
            silentAudio.src = SILENT_TRACK;
            silentAudio.loop = true;
            silentAudio.volume = 0.001;
        }
        silentAudio.play().catch(e => console.log("Silent audio start suppressed"));
    }
}

function stopKeepAlive() {
    if (silentAudio) {
        silentAudio.pause();
    }
}

document.addEventListener('visibilitychange', () => {
    if (userWantsToPlay) startKeepAlive();
});

function togglePlay() {
    const song = songs[currentSongIndex];
    if (!song) return;

    const localAudio = document.getElementById('audio-element');
    if (localAudio) {
        if (localAudio.paused) {
            localAudio.play();
        } else {
            localAudio.pause();
        }
    }
}

// Limpiar la biblioteca
function clearLibrary() {
    if (confirm("¿Seguro que quieres borrar toda tu biblioteca?")) {
        SongDB.clearAllSongs().then(() => {
            songs = [];
            renderSongs();
        });
    }
}

// Iniciar app
init();

