/**
 * Configuração global da página pós-lançamento — GTA VI (Projeto de Fã)
 * Ajuste a data oficial, os links das lojas e as flags de recursos conforme necessário.
 */
window.GTA_CONFIG = {
  // Data de lançamento configurável (ISO 8601) — <!-- VERIFICAR NA FONTE OFICIAL -->
  releaseDate: '2026-11-19T00:00:00-03:00',
  showDaysSinceLaunch: true,

  // Links das lojas (placeholders configuráveis) — <!-- VERIFICAR NA FONTE OFICIAL -->
  stores: {
    ps5: 'https://store.playstation.com/?placeholder=gta-vi-ps5',
    xbox: 'https://www.xbox.com/games/store/?placeholder=gta-vi-xbox'
  },

  // Link oficial do Trailer no YouTube
  trailer: {
    youtubeId: 'VQRLujxTm3c',
    youtubeUrl: 'https://www.youtube.com/watch?v=VQRLujxTm3c'
  },

  // Links de comunidade (placeholders configuráveis)
  social: {
    x: 'https://x.com',
    instagram: 'https://instagram.com',
    youtube: 'https://youtube.com',
    tiktok: 'https://tiktok.com',
    discord: 'https://discord.com'
  },

  // Flags de recursos e acessibilidade
  features: {
    webgl: true,        // Fundo WebGL shader (ondas de calor e partículas de vaga-lume)
    uiSound: false,     // Som de interface (cliques/hover) — desligado por padrão
    radioMuted: true,   // Rádio Web Audio API — começa mudo por padrão
    haptics: true,      // Vibração leve (navigator.vibrate) no mobile
    gyroParallax: true  // Parallax por giroscópio em dispositivos móveis
  },

  // Estações de rádio fictícias (sintetizadas via Web Audio API 100% CC0 / royalty-free)
  radioStations: [
    {
      id: 'wave',
      name: 'Wave 104.9 FM',
      genre: 'Synthwave & Sunset Drive',
      bpm: 108,
      rootFreq: 110,
      chord: [110, 130.81, 164.81, 196.0]
    },
    {
      id: 'flamingo',
      name: 'Flamingo 98.3 FM',
      genre: 'Tropical Bass & Bayside Groove',
      bpm: 120,
      rootFreq: 130.81,
      chord: [130.81, 164.81, 196.0, 246.94]
    },
    {
      id: 'neontalk',
      name: 'Vice Nocturne 88.1',
      genre: 'Ambient Noir & Midnight Keys',
      bpm: 86,
      rootFreq: 98.0,
      chord: [98.0, 116.54, 146.83, 174.61]
    }
  ]
};
