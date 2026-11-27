// What to search for. Real, photographic b-roll organised the way an editor thinks about it.
// Each category has hand-tuned queries (specific words find better footage than generic ones), and `QUERY_FOR` turns
// a spoken keyword into a better search than the word alone (used by Edit for me).

export const STOCK_CATS = [
  { id: 'city', name: 'City & Skyline', queries: ['city skyline night', 'aerial city skyline sunset', 'skyscrapers timelapse', 'downtown street night', 'drone shot city', 'city traffic night lights', 'urban rooftop view'] },
  { id: 'money', name: 'Money & Wealth', queries: ['cash money', 'counting money', 'gold coins', 'dollar bills close up', 'luxury lifestyle', 'piggy bank savings', 'wealth success'] },
  { id: 'finance', name: 'Finance & Trading', queries: ['stock market chart', 'trading screen candlestick', 'wall street', 'financial district', 'crypto trading', 'stock exchange', 'analyzing charts laptop'] },
  { id: 'business', name: 'Business & Office', queries: ['business meeting', 'modern office', 'typing on laptop', 'handshake deal', 'startup team', 'entrepreneur working', 'presentation conference room'] },
  { id: 'tech', name: 'Tech & Data', queries: ['server room data center', 'coding on screen', 'circuit board close up', 'artificial intelligence', 'smartphone scrolling', 'futuristic technology', 'data visualization'] },
  { id: 'luxury', name: 'Luxury', queries: ['luxury car', 'penthouse interior', 'yacht ocean', 'private jet', 'watch close up', 'champagne pouring', 'luxury hotel'] },
  { id: 'cars', name: 'Cars & Driving', queries: ['driving at night', 'sports car', 'highway timelapse', 'car engine', 'road trip driving', 'car headlights', 'mountain road drone'] },
  { id: 'nature', name: 'Nature', queries: ['forest mist', 'waterfall', 'mountain sunrise', 'clouds timelapse', 'river flowing', 'meadow wind', 'autumn forest'] },
  { id: 'ocean', name: 'Ocean & Beach', queries: ['ocean waves', 'tropical beach drone', 'sunset sea', 'underwater', 'surfing wave', 'coastline aerial', 'beach walking'] },
  { id: 'travel', name: 'Travel', queries: ['airport', 'train window', 'old town street', 'hot air balloon', 'airplane window', 'tourist exploring', 'mountain hiking'] },
  { id: 'fitness', name: 'Fitness', queries: ['gym workout', 'running sunrise', 'boxing training', 'weightlifting', 'yoga morning', 'cycling', 'athlete training'] },
  { id: 'food', name: 'Food & Drink', queries: ['coffee pouring', 'cooking in pan', 'restaurant kitchen', 'street food', 'baking bread', 'fresh ingredients', 'cocktail making'] },
  { id: 'people', name: 'People & Lifestyle', queries: ['friends laughing', 'woman walking city', 'walking on street', 'reading in cafe', 'family dinner', 'smiling portrait', 'crowd walking'] },
  { id: 'home', name: 'Home & Real Estate', queries: ['modern house exterior', 'luxury interior', 'kitchen interior', 'living room', 'house drone', 'apartment balcony', 'architecture detail'] },
  { id: 'fashion', name: 'Fashion & Beauty', queries: ['fashion model', 'makeup application', 'jewelry close up', 'perfume bottle', 'hair salon', 'skincare routine', 'runway'] },
  { id: 'space', name: 'Space & Science', queries: ['galaxy', 'earth from space', 'laboratory microscope', 'stars timelapse', 'northern lights', 'moon close up', 'science experiment'] },
  { id: 'moods', name: 'Weather & Moods', queries: ['rain on window', 'fog morning', 'lightning storm', 'snow falling', 'fire flames', 'sunset silhouette', 'smoke slow motion'] },
  { id: 'abstract', name: 'Abstract & Texture', queries: ['bokeh lights', 'ink in water', 'light leaks', 'gold particles', 'liquid motion', 'neon lights', 'glitter'] },
  { id: 'sports', name: 'Sports', queries: ['football stadium', 'basketball dunk', 'soccer match', 'tennis serve', 'racing', 'skateboarding', 'crowd cheering'] },
  { id: 'music', name: 'Music & Nightlife', queries: ['concert crowd', 'dj club lights', 'vinyl record', 'guitar playing', 'recording studio', 'nightclub dancing', 'headphones'] },
];

/** A spoken word → a search that finds footage that actually looks right. */
export const QUERY_FOR = {
  money: 'cash money', cash: 'cash money', profit: 'money growth chart', revenue: 'business growth chart', income: 'cash money', wealth: 'luxury lifestyle', rich: 'luxury lifestyle', dollars: 'dollar bills close up', dollar: 'dollar bills close up',
  invest: 'stock market chart', investing: 'stock market chart', investment: 'stock market chart', trading: 'trading screen candlestick', trader: 'trading screen candlestick', market: 'stock market chart', markets: 'stock market chart', stocks: 'stock market chart', stock: 'stock market chart', crypto: 'crypto trading', bitcoin: 'crypto trading', forex: 'trading screen candlestick', chart: 'stock market chart', charts: 'stock market chart',
  business: 'business meeting', company: 'modern office', startup: 'startup team', marketing: 'laptop typing office', sales: 'handshake deal', clients: 'business meeting', customers: 'business meeting', team: 'startup team', growth: 'business growth chart',
  software: 'coding on screen', code: 'coding on screen', coding: 'coding on screen', data: 'data visualization', ai: 'artificial intelligence', computer: 'typing on laptop', technology: 'futuristic technology', automation: 'robot arm factory', app: 'smartphone scrolling', phone: 'smartphone scrolling', internet: 'data center',
  city: 'city skyline night', downtown: 'downtown street night', urban: 'drone shot city', night: 'city street night', traffic: 'city traffic night lights', building: 'skyscrapers timelapse', buildings: 'skyscrapers timelapse', skyline: 'city skyline night',
  drive: 'driving at night', driving: 'driving at night', car: 'sports car', cars: 'sports car', road: 'road trip driving', speed: 'highway timelapse', fast: 'highway timelapse',
  gym: 'gym workout', workout: 'gym workout', fitness: 'gym workout', training: 'athlete training', running: 'running sunrise', run: 'running sunrise', strong: 'weightlifting', discipline: 'athlete training', hustle: 'city walking sunrise',
  coffee: 'coffee pouring', cooking: 'cooking in pan', recipe: 'cooking in pan', kitchen: 'restaurant kitchen', dinner: 'family dinner', breakfast: 'fresh ingredients',
  travel: 'travel airport', trip: 'airplane window', beach: 'tropical beach drone', mountain: 'mountain sunrise', mountains: 'mountain sunrise', ocean: 'ocean waves', nature: 'forest mist', forest: 'forest mist', sunset: 'sunset silhouette', sunrise: 'mountain sunrise', rain: 'rain on window', snow: 'snow falling',
  home: 'modern house exterior', house: 'modern house exterior', luxury: 'luxury lifestyle', fashion: 'fashion model', beauty: 'makeup application', style: 'fashion model',
  music: 'concert crowd', party: 'nightclub dancing', dance: 'nightclub dancing', concert: 'concert crowd',
  space: 'galaxy', universe: 'galaxy', stars: 'stars timelapse', planet: 'earth from space', future: 'futuristic technology',
  learn: 'reading in cafe', study: 'studying books', school: 'classroom students', book: 'reading in cafe', books: 'reading in cafe',
  love: 'couple sunset', family: 'family dinner', friends: 'friends laughing', wedding: 'wedding couple',
  fear: 'dark corridor', danger: 'storm clouds', stress: 'tired at desk', success: 'luxury lifestyle', winning: 'crowd cheering', celebrate: 'confetti celebration',
};

/** Stock searches that suit each built-in template, used by "Fill with stock". Cycled across the template's clip slots. */
export const TEMPLATE_STOCK = {
  'quick-cuts': ['city street night', 'sports car', 'dj club lights', 'skateboarding', 'running sunrise'],
  'photo-dump': ['friends laughing', 'coffee pouring', 'beach walking', 'street food', 'sunset silhouette'],
  'top-3': ['city skyline night', 'luxury car', 'tropical beach drone'],
  'event-recap': ['concert crowd', 'friends laughing', 'nightclub dancing', 'crowd cheering'],
  'before-after': ['modern house exterior', 'luxury interior'],
  'quote-card': ['clouds timelapse', 'ocean waves', 'mountain sunrise'],
  'product-showcase': ['perfume bottle', 'watch close up', 'smartphone scrolling', 'jewelry close up'],
  'talking-head': ['modern office'],
  'announcement': ['city skyline night', 'business meeting', 'startup team'],
  'channel-intro': ['futuristic technology'],
  'day-in-my-life': ['coffee pouring', 'woman walking city', 'typing on laptop', 'fresh ingredients', 'sunset silhouette'],
  'recipe-steps': ['fresh ingredients', 'cooking in pan', 'baking bread'],
  'love-story': ['couple sunset', 'beach walking', 'friends laughing'],
  'travel-film': ['aerial coastline', 'mountain sunrise', 'old town street', 'hot air balloon'],
  'movie-trailer': ['fog morning', 'lightning storm', 'city street night', 'fire flames'],
  'fitness-pump': ['gym workout', 'weightlifting', 'boxing training', 'running sunrise'],
  'gaming-highlight': ['neon lights', 'headphones', 'futuristic technology'],
};
