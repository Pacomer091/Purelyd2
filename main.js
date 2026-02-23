const DEFAULT_SONGS = [
    {
        id: 1,
        title: "Welcome to Purelyd",
        artist: "Assistant",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        cover: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
        type: 'audio'
    }
];

let songs = [];
let currentUser = null;
let users = [];
let playlists = [];
let currentPlaylistId = null; // null means 'Home' or 'Library'
let searchTerm = '';

// Global error handler for debugging
window.onerror = function (msg, url, line) {
    console.error(`[Global Error] ${msg} at ${line}`);
    debugLog(`ERR: ${msg} (L${line})`);
};

function debugLog(msg) {
    const logEl = document.getElementById('debug-console');
    if (logEl) {
        const entry = document.createElement('div');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logEl.prepend(entry);
    }
    console.log(`[DEBUG] ${msg}`);
}

let currentSongIndex = 0;
let isPlaying = false;
let ytPlayer;
let ytReady = false;
let pendingSongId = null;
let audioContext = null; // Audio Focus Warming Context
let lastProgressSyncSec = -1; // Global guard for MediaSession jitter
let editingSongId = null; // Track which song is being edited
let isSelectMode = false;
let selectedSongIds = [];
let userWantsToPlay = false; // Persistent state for background bypass
let needsGestureKickstart = true; // Workaround for Android Autoplay
const SILENT_TRACK_FILE = 'silent_keepalive.mp3';
const BRIDGE_YOUTUBE_ID = 'KgUo_fR73yY';
let keepAliveOsc = null;
let pendingKickstartIndex = null; // Track to play after valid gesture
let pendingResumeTime = 0; // Save playback position for background resume

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

// Playlist elements
const newPlaylistBtn = document.getElementById('new-playlist-btn');
const playlistModal = document.getElementById('playlist-modal');
const playlistForm = document.getElementById('playlist-form');
const playlistItemsContainer = document.getElementById('playlist-items');
const closePlaylistModal = document.getElementById('close-playlist-modal');
const addToPlaylistModal = document.getElementById('add-to-playlist-modal');
const playlistSelectorList = document.getElementById('playlist-selector-list');
const closeAddToPlaylist = document.getElementById('close-add-to-playlist');
const navHome = document.getElementById('nav-home');
const navUploads = document.getElementById('nav-uploads');
const navFavorites = document.getElementById('nav-favorites');
const menuAddPlaylist = document.getElementById('menu-add-playlist');
const menuFavorite = document.getElementById('menu-favorite');

// Bulk Import elements
const bulkImportBtn = document.getElementById('bulk-import-btn');
const bulkImportModal = document.getElementById('bulk-import-modal');
const bulkUrlsArea = document.getElementById('bulk-urls');
const startBulkImportBtn = document.getElementById('start-bulk-import');
const closeBulkModal = document.getElementById('close-bulk-modal');
const importStatus = document.getElementById('import-status');
const importProgressText = document.getElementById('import-progress-text');
const importProgressBar = document.getElementById('import-progress-bar');

// New Auth Elements
const authEmail = document.getElementById('auth-email');
const authConfirmPassword = document.getElementById('auth-confirm-password');
const genreModal = document.getElementById('genre-modal');
const genreGrid = document.getElementById('genre-grid');
const saveGenresBtn = document.getElementById('save-genres');
const audioElement = document.getElementById('audio-element');
const playPauseBtn = document.getElementById('play-pause-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.querySelector('.current-time');
const totalTimeEl = document.querySelector('.total-time');
const volumeSlider = document.getElementById('volume-slider');

const playerStatus = document.getElementById('player-status');
const toggleSelectBtn = document.getElementById('toggle-select-mode');
const multiActionBar = document.getElementById('multi-action-bar');
const selectedCountEl = document.querySelector('.selected-count');
const bulkFavBtn = document.getElementById('bulk-fav-btn');
const bulkPlaylistBtn = document.getElementById('bulk-playlist-btn');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const cancelSelectBtn = document.getElementById('cancel-select-btn');

const menuToggle = document.getElementById('menu-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebar = document.querySelector('.sidebar');
const searchInput = document.getElementById('search-input');

// Mobile Nav Elements
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

// YouTube API Initialization
window.onYouTubeIframeAPIReady = function () {
    setStatus("API LOADED, INITIALIZING...");

    // Check if running correctly
    if (window.location.protocol === 'file:') {
        console.warn("WARNING: Running from file:// protocol. YouTube API may be blocked.");
        setStatus("FILE PROTOCOL DETECTED (MAY BLOCK YT)");
    } else {
        setStatus("PROTOCOL: " + window.location.protocol);
    }

    try {
        ytPlayer = new YT.Player('youtube-player', {
            height: '200',
            width: '200',
            playerVars: {
                'autoplay': 1,
                'controls': 1, // Let's try with controls visible initially for debug
                'disablekb': 1,
                'fs': 0,
                'iv_load_policy': 3,
                'modestbranding': 1,
                'rel': 0,
                'enablejsapi': 1,
                'origin': window.location.origin,
                'playsinline': 1
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError
            }
        });
        setStatus("PLAYER CREATED, WAITING READY...");
    } catch (e) {
        setStatus("INIT ERROR: " + e.message);
        debugLog("YT INIT ERROR: " + e.message);
        console.error(e);
    }
};

// Safety: Trigger manually if script loaded before main.js
if (window.YT && window.YT.Player) {
    console.log("YT API already present, triggering manual init");
    window.onYouTubeIframeAPIReady();
}


function onPlayerReady(event) {
    ytReady = true;
    setStatus("READY");
    console.log("YouTube Player is ready");

    // Refresh MediaSession immediately to fix "Stuck Cover" on first load
    const song = songs[currentSongIndex];
    if (song) updateMediaSession(song);

    if (pendingSongId) {
        setStatus("PLAYING PENDING...");
        ytPlayer.loadVideoById(pendingSongId);
        ytPlayer.playVideo();
        pendingSongId = null;
    }
}

function kickstartYouTubeVisibility() {
    const iframe = document.getElementById('youtube-player');
    if (!iframe) return;

    // Pulse visibility to ensure render pipeline engagement
    iframe.style.opacity = "1";
    iframe.style.zIndex = "10001";
    iframe.focus();

    setTimeout(() => {
        iframe.style.opacity = "0.8";
        iframe.style.zIndex = "1000";
    }, 4000);
}

function onPlayerError(event) {
    console.error("YouTube Player Error:", event.data);
    setStatus("YT ERROR: " + event.data);
    // 101/150 = Video not allowed in embedded players
    if (event.data === 101 || event.data === 150) {
        nextSong();
    }
}

function onPlayerStateChange(event) {
    const states = {
        [-1]: "UNSTARTED",
        [YT.PlayerState.ENDED]: "ENDED",
        [YT.PlayerState.PLAYING]: "PLAYING",
        [YT.PlayerState.PAUSED]: "PAUSED",
        [YT.PlayerState.BUFFERING]: "BUFFERING",
        [YT.PlayerState.CUED]: "CUED"
    };
    setStatus(states[event.data] || "UNKNOWN");

    if (event.data === YT.PlayerState.ENDED) {
        try {
            if (pendingKickstartIndex !== null) {
                console.log("Bridge ended, resuming original song...");
                nextSong();
            } else {
                nextSong();
            }
        } catch (e) {
            console.error("Error in onPlayerStateChange ENDED (APK):", e);
        }
    } else if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        userWantsToPlay = true;
        playPauseBtn.textContent = '⏸';

        // Resilience 14.0: Restore Volume strictly after confirmed playback
        if (ytPlayer.unMute) ytPlayer.unMute();
        if (ytPlayer.setVolume) ytPlayer.setVolume(volumeSlider.value);

        // Skip metadata/keepalive updates during bridge to avoid competing audio
        if (pendingKickstartIndex === null) {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = "playing";
                updateMediaSession(songs[currentSongIndex]);
            }
            startKeepAlive();
        }
    } else if (event.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        playPauseBtn.textContent = '▶';
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "paused";
            updateMediaSessionPositionState();
        }
        stopKeepAlive();
    }
}

function nextSong() {
    if (pendingKickstartIndex !== null) {
        const target = pendingKickstartIndex;
        const resumeAt = pendingResumeTime;
        pendingKickstartIndex = null;
        pendingResumeTime = 0;
        playSong(target, resumeAt);
        return;
    }
    currentSongIndex = (currentSongIndex + 1) % songs.length;
    playSong(currentSongIndex);
}

function prevSong() {
    let prevIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    playSong(prevIndex);
}

// Initialize
async function init() {
    console.log("Initializing application...");

    // 1. Load session first
    currentUser = JSON.parse(localStorage.getItem('purelyd-current-user'));

    // 2. Mandatory UI Setup
    setupEventListeners();
    updateAuthUI();

    try {
        console.log("Connecting to Supabase Cloud...");

        // Refresh users from cloud
        users = await UserDB.getAllUsers();
        console.log("Cloud users loaded.");

        await loadUserSongs();
        await loadPlaylists();

        renderPlaylists();
        renderSongs();

        console.log("Cloud data synchronized.");
    } catch (e) {
        console.warn("CLOUD SYNC FAILED (showing default songs):", e);
        // Fallback to defaults
        songs = [...DEFAULT_SONGS];
        renderSongs();
    }
    console.log("Init complete.");
}

// Utility to migrate local data to cloud
async function migrateToCloud() {
    console.log("Starting cloud migration...");
    const DB_NAME = 'purelyd_db';
    const DB_VERSION = 2;

    const openOldDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    };

    try {
        const oldDb = await openOldDB();
        const transaction = oldDb.transaction(['songs'], 'readonly');
        const store = transaction.objectStore('songs');
        const request = store.getAll();

        request.onsuccess = async () => {
            const oldSongs = request.result;
            if (oldSongs.length === 0) {
                alert("No se encontraron canciones locales para migrar.");
                return;
            }

            console.log(`Migrando ${oldSongs.length} canciones...`);
            let count = 0;
            for (const song of oldSongs) {
                try {
                    // Upload to Supabase using our new SongDB
                    await SongDB.addSong(song, song.username || 'invitado');
                    count++;
                } catch (err) {
                    console.error("Error migrando canción:", song.title, err);
                }
            }

            localStorage.setItem('purelyd-cloud-migrated', 'true');
            alert(`¡Migración completada! Se han subido ${count} canciones a la nube.`);
            window.location.reload(); // Reload to show new data
        };
    } catch (e) {
        console.error("Error abriendo la base de datos antigua:", e);
        alert("No se pudo acceder a los datos locales antiguos.");
    }
}

async function migrateData() {
    const migratedKey = 'purelyd-migrated-to-idb';
    if (localStorage.getItem(migratedKey)) return;

    console.log("Starting data migration to IndexedDB...");

    // Migrate Users
    const localUsers = JSON.parse(localStorage.getItem('purelyd-users')) || [];
    for (const user of localUsers) {
        try {
            await UserDB.addUser(user);
            console.log(`Migrated user: ${user.username}`);

            // Migrate Songs for this user
            const localSongs = JSON.parse(localStorage.getItem(`purelyd-songs-${user.username}`)) || [];
            for (const song of localSongs) {
                await SongDB.addSong(song, user.username);
            }
            console.log(`Migrated ${localSongs.length} songs for user: ${user.username}`);
        } catch (e) {
            console.warn(`Error migrating user ${user.username}:`, e);
        }
    }

    localStorage.setItem(migratedKey, 'true');
    console.log("Migration complete.");
}

async function loadUserSongs() {
    if (currentUser) {
        if (currentPlaylistId === 'favorites') {
            const allSongs = await SongDB.getAllSongs();
            const favIds = currentUser.favorites || [];
            songs = allSongs.filter(s => favIds.includes(s.id));
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
            navLibrary.classList.remove('active');
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
        audioElement.pause();
        if (ytReady && ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
    }
}

function renderSongs() {
    const mainHeading = document.querySelector('.content-area h1');
    if (mainHeading) {
        if (currentPlaylistId === 'favorites') mainHeading.textContent = 'My Favorites';
        else if (currentPlaylistId === 'uploads') mainHeading.textContent = 'Subido por mí';
        else if (currentPlaylistId) {
            const p = playlists.find(p => p.id === currentPlaylistId);
            mainHeading.textContent = p ? p.name : 'Playlist';
        } else {
            mainHeading.textContent = 'All Songs (Home)';
        }
    }

    const favIds = currentUser ? (currentUser.favorites || []) : [];

    const filteredSongs = songs.filter(song => {
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
    if (song.type === 'youtube') {
        const id = getYTId(song.url);
        // Try to get maxres, but could fallback if needed. For now maxres is standard for modern YT.
        return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
    }
    return 'https://via.placeholder.com/300';
}

function getYTId(url) {
    if (!url) return null;
    // Robust pattern for many YT URL formats including shorts and direct IDs
    const patterns = [
        /(?:v=|\/v\/|embed\/|youtu\.be\/|\/shorts\/)([^#&?]{11})/,
        /^[a-zA-Z0-9_-]{11}$/ // Direct ID
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function setupEventListeners() {
    // Search Listener
    searchInput.oninput = (e) => {
        searchTerm = e.target.value;
        renderSongs();
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

    mobNavPlaylists.onclick = () => {
        // Scroll to the sidebar's playlist section if possible, 
        // or just open the sidebar if we want to show playlists.
        // On mobile, the sidebar is hidden, so maybe we should just
        // show a specific playlist view or just notify the user.
        // For now, let's just close the overlay and maybe scroll to the top
        // or toggle the sidebar if it still exists (it's hidden in CSS though).
        // Best approach: If we had a 'Playlists' view, load it.
        // Since playlists are in the sidebar, let's just alert for now or
        // implement a quick way to see them.
        mobileLibOverlay.classList.remove('active');
        // Let's assume the user wants to see the list of playlists.
        // Since we don't have a dedicated 'Playlists' main view yet,
        // maybe we should create one. But for now, let's just close.
        alert("¡Accede a tus playlists desde el menú lateral en escritorio!");
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
        await loadUserSongs();
        renderSongs();
        renderPlaylists();
    };

    navUploads.onclick = async (e) => {
        e.preventDefault();
        if (!currentUser) return showAuthModal();
        currentPlaylistId = 'uploads';
        navUploads.classList.add('active');
        navHome.classList.remove('active');
        navFavorites.classList.remove('active');
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
        await PlaylistDB.addPlaylist({
            name,
            username: currentUser.username,
            songIds: []
        });
        playlistModal.style.display = 'none';
        playlistForm.reset();
        await loadPlaylists();
        renderPlaylists();
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
        const newFavs = await UserDB.toggleFavorite(currentUser.username, song.id);
        currentUser.favorites = newFavs;
        localStorage.setItem('purelyd-current-user', JSON.stringify(currentUser));

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
        const playlistMatch = lines[0].match(/[?&]list=([^#&?]+)/);
        if (playlistMatch && lines.length === 1) {
            const playlistId = playlistMatch[1];
            importProgressText.textContent = `Extrayendo canciones de la playlist...`;

            try {
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(lines[0])}`;
                const response = await fetch(proxyUrl);
                const data = await response.json();
                const html = data.contents;

                // Extract video IDs and Titles using regex from ytInitialData
                const videoIds = [];
                const idRegex = /"videoId":"([^"]{11})"/g;
                let match;
                while ((match = idRegex.exec(html)) !== null) {
                    if (!videoIds.includes(match[1])) videoIds.push(match[1]);
                }

                if (videoIds.length > 0) {
                    lines = videoIds.map(id => `https://www.youtube.com/watch?v=${id}`);
                    console.log(`Extraction successful: ${lines.length} songs found.`);
                } else {
                    throw new Error("No se encontraron vídeos en la playlist.");
                }
            } catch (e) {
                alert("Error al extraer la playlist. Intenta pegar los enlaces de los vídeos directamente.");
                console.error("Playlist extraction error:", e);
                startBulkImportBtn.disabled = false;
                return;
            }
        }

        for (let i = 0; i < lines.length; i++) {
            const url = lines[i];
            const ytId = getYTId(url);

            importProgressText.textContent = `Procesando ${i + 1} de ${lines.length}...`;
            importProgressBar.style.width = `${((i + 1) / lines.length) * 100}%`;

            if (ytId) {
                try {
                    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
                    if (response.ok) {
                        const data = await response.json();
                        const newSong = {
                            id: Date.now() + Math.random(),
                            title: data.title || "Unknown Title",
                            artist: data.author_name || "Unknown Artist",
                            url: url,
                            cover: data.thumbnail_url || "",
                            type: 'youtube'
                        };
                        await SongDB.addSong(newSong, currentUser.username);
                        importedCount++;
                    }
                } catch (e) {
                    console.error("Error importing:", url, e);
                }
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

    // Auto-fill YouTube Metadata
    const songUrlInput = document.getElementById('song-url');
    const songTitleInput = document.getElementById('song-title');
    const songArtistInput = document.getElementById('song-artist');
    const songCoverInput = document.getElementById('song-cover');

    songUrlInput.oninput = async () => {
        const url = songUrlInput.value.trim();
        const ytId = getYTId(url);

        if (ytId) {
            console.log("Fetching YT metadata for:", ytId);
            try {
                // Use oEmbed to get title and thumbnail
                // Using a proxy or direct fetch if CORS allows (YouTube oEmbed usually allows)
                const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
                if (response.ok) {
                    const data = await response.json();
                    if (!songTitleInput.value) songTitleInput.value = data.title || "";
                    if (!songArtistInput.value) songArtistInput.value = data.author_name || "";
                    if (!songCoverInput.value) songCoverInput.value = data.thumbnail_url || "";
                    console.log("Metadata auto-filled");
                }
            } catch (e) {
                console.warn("Failed to fetch YT metadata:", e);
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
        localStorage.removeItem('purelyd-current-user');
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
        authSwitch.querySelector('span').textContent = isRegisterMode ? 'Log In' : 'Register';
        authSwitch.childNodes[0].textContent = isRegisterMode ? 'Already have an account? ' : "Don't have an account? ";

        // Toggle new fields
        authEmail.style.display = isRegisterMode ? 'block' : 'none';
        authConfirmPassword.style.display = isRegisterMode ? 'block' : 'none';
        authEmail.required = isRegisterMode;
        authConfirmPassword.required = isRegisterMode;
    }

    authSwitch.onclick = () => {
        isRegisterMode = !isRegisterMode;
        updateAuthModalUI();
    };

    closeAuth.onclick = () => authModal.style.display = 'none';

    authForm.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value.trim();
        const email = authEmail.value.trim();
        const confirmPassword = authConfirmPassword.value.trim();

        console.log(`Auth attempt: ${isRegisterMode ? 'Register' : 'Login'} for ${username}`);

        if (isRegisterMode) {
            if (password !== confirmPassword) {
                return alert('Las contraseñas no coinciden.');
            }
            if (await UserDB.getUser(username)) {
                return alert('Ese nombre de usuario ya existe.');
            }

            // Temporary user object to start onboarding
            const newUser = { username, password, email, genres: [] };
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
            localStorage.setItem('purelyd-current-user', JSON.stringify(currentUser));
            authModal.style.display = 'none';
            authForm.reset();
            await init();
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
                    alert('Solo puedes elegir hasta 3 géneros.');
                }
            };
        });

        genreModal.style.display = 'flex';
    }

    saveGenresBtn.onclick = async () => {
        if (selectedGenres.length === 0) {
            return alert('Por favor, elige al menos un género.');
        }

        currentUser.genres = selectedGenres;
        // Update user in DB
        await UserDB.updateUser(currentUser);

        localStorage.setItem('purelyd-current-user', JSON.stringify(currentUser));
        genreModal.style.display = 'none';
        await init();
    };

    addSongForm.onsubmit = async (e) => {
        e.preventDefault();
        const url = document.getElementById('song-url').value;
        const ytId = getYTId(url);

        const songData = {
            title: document.getElementById('song-title').value,
            artist: document.getElementById('song-artist').value,
            url: url,
            cover: document.getElementById('song-cover').value,
            type: ytId ? 'youtube' : 'audio'
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

    progressBar.oninput = () => {
        const song = songs[currentSongIndex];
        if (song.type === 'youtube') {
            const time = (progressBar.value / 100) * ytPlayer.getDuration();
            ytPlayer.seekTo(time, true);
        } else {
            const time = (progressBar.value / 100) * audioElement.duration;
            audioElement.currentTime = time;
        }
    };

    volumeSlider.oninput = () => {
        const vol = volumeSlider.value;
        audioElement.volume = vol / 100;
        if (ytReady) ytPlayer.setVolume(vol);
    };

    audioElement.ontimeupdate = updateProgress;
    audioElement.onended = nextSong;
    audioElement.onloadedmetadata = () => {
        if (songs[currentSongIndex].type === 'audio') {
            totalTimeEl.textContent = formatTime(audioElement.duration);
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

    // Start UI update loop for YouTube
    setInterval(updateProgress, 1000);

    // Unify state management for native audio element
    audioElement.onplay = () => {
        isPlaying = true;
        userWantsToPlay = true;
        playPauseBtn.textContent = '⏸';
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "playing";
            updateMediaSessionPositionState();
        }
        startKeepAlive();
    };

    audioElement.onpause = () => {
        isPlaying = false;
        playPauseBtn.textContent = '▶';
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "paused";
            updateMediaSessionPositionState();
        }
        // ONLY stop keep-alive if the user EXPLICITLY paused
        if (!userWantsToPlay) {
            stopKeepAlive();
        }
    };
}

// Utility to export all songs for GitHub deployment
async function exportAllSongs() {
    const allSongs = await SongDB.getAllSongs();
    console.log("--- COPIA ESTO Y PÁSAMELO ---");
    console.log(JSON.stringify(allSongs, null, 2));
    console.log("-------------------------------");
    alert("Lista de canciones exportada a la consola (F12). Cópiamela para incluirla en el despliegue.");
}

async function playSong(index, resumeAtSeconds = 0) {
    currentSongIndex = index;
    const song = songs[index];
    if (!song) return;

    // Stop previous players
    audioElement.pause();
    if (ytReady && ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();

    // Background Resilience: Ensure silence starts for every track
    startKeepAlive();

    // Update UI (Conditional)
    if (!needsGestureKickstart) {
        document.querySelector('.player-song-info .song-name').textContent = song.title;
        document.querySelector('.player-song-info .artist-name').textContent = song.artist;
        const cover = song.cover || getThumbnail(song);
        document.querySelector('.player-cover').style.backgroundImage = `url(${cover})`;
        document.querySelector('.player-cover').style.backgroundSize = 'cover';
    }

    const videoId = getYTId(song.url);
    if (song.type === 'youtube' || videoId) {
        if (!videoId) {
            setStatus("INVALID YOUTUBE ID");
            return;
        }


        // v4.1: YouTube Innertube Direct Extraction
        // Talks DIRECTLY to YouTube's servers — no third-party proxy needed.
        // Uses the ANDROID client identity to get raw audio stream URLs.
        setStatus(`FETCHING STREAM: ${videoId}`);
        playPauseBtn.textContent = '⏸';
        userWantsToPlay = true;

        // Warm up MediaSession immediately
        updateMediaSession(song);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "playing";
        }

        const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
        const clients = [
            { name: 'ANDROID', version: '19.09.37', sdk: 30 },
            { name: 'WEB', version: '2.20240313.05.00' }
        ];

        let streamFound = false;
        for (const client of clients) {
            if (streamFound) break;
            try {
                setStatus(`TRYING ${client.name} CLIENT...`);
                const body = {
                    videoId: videoId,
                    context: {
                        client: {
                            clientName: client.name,
                            clientVersion: client.version,
                            ...(client.sdk ? { androidSdkVersion: client.sdk } : {}),
                            hl: 'en', gl: 'US'
                        }
                    }
                };

                const response = await fetch(
                    `https://music.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                        signal: AbortSignal.timeout(10000)
                    }
                );

                if (!response.ok) {
                    console.warn(`Innertube ${client.name} returned ${response.status}`);
                    continue;
                }

                const data = await response.json();

                if (data.playabilityStatus?.status !== 'OK') {
                    setStatus(`YT STATUS: ${data.playabilityStatus?.status || 'UNKNOWN'}`);
                    console.warn('Playability:', data.playabilityStatus?.reason);
                    continue;
                }

                // Extract audio streams from adaptiveFormats
                const formats = data.streamingData?.adaptiveFormats || [];
                const audioFormats = formats
                    .filter(f => f.mimeType && f.mimeType.startsWith('audio/') && f.url)
                    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

                if (audioFormats.length > 0) {
                    const best = audioFormats[0];
                    const kbps = Math.round(best.bitrate / 1000);
                    setStatus(`STREAM: ${kbps}kbps ${best.mimeType.split(';')[0]}`);
                    debugLog(`Audio: ${best.mimeType} @ ${best.bitrate}bps via ${client.name}`);

                    // Play through the existing <audio> element
                    audioElement.src = best.url;
                    audioElement.play().then(() => {
                        isPlaying = true;
                        userWantsToPlay = true;
                        if (resumeAtSeconds > 0) {
                            audioElement.currentTime = resumeAtSeconds;
                            console.log(`Resuming at ${resumeAtSeconds}s`);
                        }
                        setStatus(`PLAYING (${kbps}kbps)`);
                        if ('mediaSession' in navigator) {
                            updateMediaSession(song);
                            navigator.mediaSession.playbackState = "playing";
                        }
                        updateMediaSessionPositionState();
                        startKeepAlive();
                    }).catch(e => {
                        setStatus("PLAY ERROR: " + e.message);
                        console.error("Stream playback error:", e);
                    });

                    streamFound = true;
                } else {
                    setStatus("NO AUDIO IN RESPONSE");
                    debugLog("Formats: " + formats.length + ", audio: 0");
                }
            } catch (e) {
                console.warn(`Innertube ${client.name} failed:`, e.message);
                setStatus(`${client.name} FAILED: ${e.message.substring(0, 30)}`);
                continue;
            }
        }

        if (!streamFound) {
            setStatus("EXTRACTION FAILED - SKIPPING");
            debugLog("Failed to extract audio for: " + videoId);
            setTimeout(() => nextSong(), 2000);
        }

        isPlaying = false;
    } else {
        setStatus("PLAYING AUDIO FILE");
        audioElement.src = song.url;
        audioElement.play().then(() => {
            isPlaying = true;
            userWantsToPlay = true;
            if ('mediaSession' in navigator) {
                updateMediaSession(song);
                navigator.mediaSession.playbackState = "playing";
            }
            updateMediaSessionPositionState();
            startKeepAlive();
        }).catch(e => {
            setStatus("AUDIO ERROR");
            console.error("Playback error:", e);
        });
        userWantsToPlay = true;
        isPlaying = false;
        updateMediaSession(song);
    }
}

function updateMediaSession(song) {
    if (!('mediaSession' in navigator) || pendingKickstartIndex !== null) return;

    navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: 'Purelyd Music',
        artwork: [
            { src: song.cover || getThumbnail(song), sizes: '512x512', type: 'image/png' }
        ]
    });

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    updateMediaSessionPositionState();
}

function initMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;

    const handlers = {
        'play': () => {
            if (pendingKickstartIndex !== null) {
                nextSong();
                return;
            }
            userWantsToPlay = true;
            startKeepAlive();
            const song = songs[currentSongIndex];
            if (!song) return;
            if (song.type === 'youtube' && ytReady) {
                ytPlayer.playVideo();
            } else if (song.type === 'audio') {
                audioElement.play();
            }
        },
        'pause': () => {
            userWantsToPlay = false;
            const song = songs[currentSongIndex];
            if (!song) return;
            if (song.type === 'youtube' && ytReady) {
                ytPlayer.pauseVideo();
            } else if (song.type === 'audio') {
                audioElement.pause();
            }
        },
        'previoustrack': () => prevSong(),
        'nexttrack': () => nextSong(),
        'seekbackward': (details) => {
            const skipTime = details.seekOffset || 10;
            seekRelative(-skipTime);
        },
        'seekforward': (details) => {
            const skipTime = details.seekOffset || 10;
            seekRelative(skipTime);
        },
        'seekto': (details) => {
            const song = songs[currentSongIndex];
            if (!song) return;
            if (details.fastSeek && 'fastSeek' in audioElement && song.type === 'audio') {
                audioElement.fastSeek(details.seekTime);
            } else {
                seekToTime(details.seekTime);
            }
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

function updateMediaSessionPositionState() {
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
        const song = songs[currentSongIndex];
        if (!song) return;

        let duration = 0;
        let currentTime = 0;
        let rate = 1;

        // Force YouTube stats if bridge is active
        if (pendingKickstartIndex !== null) {
            duration = 3;
            currentTime = ytPlayer.getCurrentTime();
            try { rate = ytPlayer.getPlaybackRate() || 1; } catch (e) { }
        } else if (song && song.type === 'youtube' && ytReady) {
            if (ytReady && ytPlayer.getDuration) {
                duration = ytPlayer.getDuration();
                currentTime = ytPlayer.getCurrentTime();
                try { rate = ytPlayer.getPlaybackRate() || 1; } catch (e) { }
            }
        } else if (song && song.type === 'audio') {
            duration = audioElement.duration;
            currentTime = audioElement.currentTime;
            rate = audioElement.playbackRate || 1;
        }

        if (duration && !isNaN(duration) && duration > 0 && !isNaN(currentTime)) {
            try {
                const safePosition = Math.min(Math.max(0, currentTime), duration);
                navigator.mediaSession.setPositionState({
                    duration: duration,
                    playbackRate: isPlaying ? rate : 0,
                    position: safePosition
                });
            } catch (e) { }
        }
    }
}

function seekRelative(offset) {
    const song = songs[currentSongIndex];
    if (song.type === 'youtube' && ytReady) {
        ytPlayer.seekTo(ytPlayer.getCurrentTime() + offset, true);
    } else {
        audioElement.currentTime += offset;
    }
    updateMediaSessionPositionState();
}

function seekToTime(time) {
    const song = songs[currentSongIndex];
    if (song.type === 'youtube' && ytReady) {
        ytPlayer.seekTo(time, true);
    } else {
        audioElement.currentTime = time;
    }
}

const silentAudio = document.getElementById('silent-audio');

function startKeepAlive() {
    if (silentAudio) {
        if (!silentAudio.src.includes(SILENT_TRACK_FILE)) {
            silentAudio.src = SILENT_TRACK_FILE;
            silentAudio.loop = true;
            silentAudio.volume = 0.001;
        }
        silentAudio.play().catch(() => { });
    }
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') audioContext.resume();
        if (!keepAliveOsc) {
            keepAliveOsc = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 0.0001;
            keepAliveOsc.connect(gainNode);
            gainNode.connect(audioContext.destination);
            keepAliveOsc.start();
        }
    } catch (e) { }
}

document.addEventListener('click', () => {
    startKeepAlive();
    initMediaSessionHandlers();
}, { once: true });

document.addEventListener('touchstart', () => {
    startKeepAlive();
    initMediaSessionHandlers();
}, { once: true });

function stopKeepAlive() {
    if (silentAudio) {
        silentAudio.pause();
    }
    if (keepAliveOsc) {
        try {
            keepAliveOsc.stop();
            keepAliveOsc.disconnect();
        } catch (e) { }
        keepAliveOsc = null;
    }
}

// Ensure silence plays whenever music starts to tell the OS we are active
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        const song = songs[currentSongIndex];
        if (isPlaying && song && song.type === 'youtube' && ytReady) {
            // In APK, we might be playing via audioElement (direct stream).
            // We must pause it so the bridge can take over clearly.
            if (!audioElement.paused) audioElement.pause();

            // Save current playback position before bridge
            pendingResumeTime = audioElement.currentTime || 0;
            console.log(`Saving resume time: ${pendingResumeTime}s`);

            // Stop the YouTube player first to prevent audio overlap
            if (ytPlayer.stopVideo) ytPlayer.stopVideo();

            pendingKickstartIndex = currentSongIndex;
            // Load bridge starting at second 27 (of 30s) for a ~3s bridge
            ytPlayer.loadVideoById({ videoId: BRIDGE_YOUTUBE_ID, startSeconds: 27 });
            ytPlayer.playVideo();
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: String.fromCodePoint(0x25B6) + " / " + String.fromCodePoint(0x23ED) + " PULSA PLAY PARA RESUMIR",
                    artist: "Sincronizando modo segundo plano...",
                    album: "Purelyd Bridge",
                    artwork: [{ src: "https://img.youtube.com/vi/" + BRIDGE_YOUTUBE_ID + "/maxresdefault.jpg", sizes: "512x512", type: "image/png" }]
                });
            }
        }
    } else {
        const song = songs[currentSongIndex];
        if (song) updateMediaSession(song);
        updateProgress();
        if (userWantsToPlay && !isPlaying) {
            if (pendingKickstartIndex !== null) {
                console.log("Foreground detected during bridge, forcing resumption.");
                nextSong();
            } else if (song && song.type === 'youtube' && ytReady) {
                ytPlayer.playVideo();
            }
        }
    }
    if (userWantsToPlay) startKeepAlive();
});

function togglePlay() {
    const song = songs[currentSongIndex];
    if (song.url.includes("youtube.com") || song.url.includes("youtu.be")) {
        if (!ytReady) return setStatus("YT NOT READY");

        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) {
            ytPlayer.pauseVideo();
            userWantsToPlay = false;
        } else {
            kickstartYouTubeVisibility();
            ytPlayer.playVideo();
            userWantsToPlay = true;
        }
    } else {
        if (audioElement.paused) {
            audioElement.play();
            userWantsToPlay = true;
        } else {
            audioElement.pause();
            userWantsToPlay = false;
        }
    }
}

function updateProgress() {
    const song = songs[currentSongIndex];
    if (!song && pendingKickstartIndex === null) return;

    let current, duration;

    if (pendingKickstartIndex !== null || (song && song.type === 'youtube' && ytReady)) {
        if (ytReady && ytPlayer.getDuration) {
            current = ytPlayer.getCurrentTime();
            // Hardcode bridge duration to 3s
            duration = (pendingKickstartIndex !== null) ? 3 : ytPlayer.getDuration();
        }
    } else if (song && song.type === 'audio') {
        current = audioElement.currentTime;
        duration = audioElement.duration;
    }

    if (current !== undefined && duration > 0) {
        const progress = (current / duration) * 100;
        progressBar.value = progress;
        currentTimeEl.textContent = formatTime(current);
        totalTimeEl.textContent = formatTime(duration);

        // Resilience 13.0: Smooth & Stable Progress Sync
        const currentSec = Math.floor(current);
        if (isPlaying) {
            if (lastProgressSyncSec !== currentSec) {
                updateMediaSessionPositionState();
                lastProgressSyncSec = currentSec;
            }
        }
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

let menuTargetIndex = null;

function showMenu(event, index) {
    if (!event) return;

    console.log("showMenu for index:", index);
    menuTargetIndex = index;
    const menu = document.getElementById('context-menu');

    if (!menu) {
        console.error("Menu container not found!");
        return;
    }

    menu.style.display = 'block';

    // Update Favorite text dynamically
    if (currentUser && songs[index]) {
        const isFav = (currentUser.favorites || []).includes(songs[index].id);
        menuFavorite.textContent = isFav ? "Quitar de Favoritos" : "Añadir a Favoritos";
    }

    // Calculate position
    const menuWidth = 160;
    let x = event.clientX;
    let y = event.clientY;

    // Keep menu inside window
    if (x + menuWidth > window.innerWidth) x -= menuWidth;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    console.log(`Menu active at ${x}, ${y}`);
}

function hideMenu() {
    document.getElementById('context-menu').style.display = 'none';
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

async function saveSongs() {
    if (!currentUser) return;
    console.log(`Saving ${songs.length} songs for ${currentUser.username} to DB`);
    for (const song of songs) {
        if (!song.id) song.id = Date.now() + Math.random();
        await SongDB.addSong(song, currentUser.username);
    }
}

// Optional: Add a function to clear the library if user wants to reset
function clearLibrary() {
    if (confirm("¿Seguro que quieres borrar toda tu biblioteca?")) {
        songs = [];
        saveSongs();
        renderSongs();
    }
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
    localStorage.setItem('purelyd-current-user', JSON.stringify(currentUser));
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

init();
