/**
 * Intent Detection & Domain Restriction Service
 * Identifies language, classifies intent, enforces strict Readora domain boundaries,
 * and handles deterministic Fast-Path FAQs (0 Gemini API calls).
 */

// Regex patterns for language identification
const TAMIL_CHAR_REGEX = /[\u0B80-\u0BFF]/;
const SINHALA_CHAR_REGEX = /[\u0D80-\u0DFF]/;

const THANGLISH_KEYWORDS = [
  'irukka', 'irukaa', 'irukku', 'vanakkam', 'kedaikkuma', 'vilai', 'evlo', 
  'eppadi', 'solunga', 'panna', 'mudiyum', 'vanganum', 'venum', 'nalla', 
  'puthagam', 'pusthakam', 'kathai', 'kavithai', 'parunga'
];

const SINGLISH_KEYWORDS = [
  'thiyenawada', 'thiyeda', 'thiyenawa', 'ayubowan', 'kohomada', 'potha', 
  'poth', 'miliya', 'gana', 'karanna', 'puluwanda', 'hondada', 'kiyada'
];

// Out-of-domain keywords (strictly forbidden topics across EN, TA, SI)
const OUT_OF_DOMAIN_PATTERNS = [
  // Politics, World News & Current Affairs
  /\b(politic(s|al)?|politician|president|minister|election|parliament|biden|trump|putin|war|government|news|crisis|economy|democracy)\b/i,
  /(அரசியல்|தேர்தல்|ஜனாதிபதி|பிரதமர்|அரசாங்கம்|செய்திகள்)/i,
  /(දේශපාලන|මැතිවරණ|ජනාධිපති|ආණ්ඩුව|පුවත්)/i,

  // General programming/IT
  /\b(write\s*code|javascript|python|fix\s*bug|html|css|sql|c\+\+|java|react|node|algorithm|programming)\b/i,

  // Medical & Health advice
  /\b(headache|fever|medicine|paracetamol|doctor|hospital|disease|symptom|prescription|cure|covid|tablet|pharmacy)\b/i,
  /(மருத்துவம்|மருந்து|நோய்|தலைவலி|காய்ச்சல்)/i,
  /(බෙහෙත්|රෝග|වෛද්‍ය|උණ)/i,

  // Legal & Financial advice
  /\b(legal\s*advice|lawyer|court|crypto|bitcoin|stock\s*market|invest|forex|loan|interest\s*rate)\b/i,

  // General trivia/trivia questions unrelated to books/readora
  /\b(capital\s*of|population\s*of|distance\s*between|who\s*is\s*the\s*ceo|who\s*won|weather\s*(in|today)?)\b/i
];

/**
 * Detect language of query (en, ta, si, thanglish, singlish)
 */
export function detectLanguage(text = '') {
  if (!text) return 'en';
  if (TAMIL_CHAR_REGEX.test(text)) return 'ta';
  if (SINHALA_CHAR_REGEX.test(text)) return 'si';

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);

  const hasThanglish = THANGLISH_KEYWORDS.some(k => words.includes(k) || lower.includes(k));
  if (hasThanglish) return 'thanglish';

  const hasSinglish = SINGLISH_KEYWORDS.some(k => words.includes(k) || lower.includes(k));
  if (hasSinglish) return 'singlish';

  return 'en';
}

/**
 * Check if query violates domain boundaries
 */
export function isOutOfDomain(text = '') {
  return OUT_OF_DOMAIN_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Get domain restriction polite rejection message in user's language
 */
export function getOutOfDomainResponse(lang = 'en') {
  switch (lang) {
    case 'ta':
      return 'மன்னிக்கவும், நான் ReadAura (readaura.lk) புத்தகங்கள், ஆர்டர்கள் மற்றும் இணையதள வழிசெலுத்தல் தொடர்பான கேள்விகளுக்கு மட்டுமே உதவ முடியும்.';
    case 'si':
      return 'සමාවෙන්න, මට ReadAura (readaura.lk) පොත්, ඇණවුම් සහ වෙබ් අඩවි මගපෙන්වීම් පිළිබඳව පමණක් උපකාර කළ හැක.';
    case 'thanglish':
      return 'Sorry, ReadAura (readaura.lk) books, orders, matrum website navigation pathi mattum dhaan naan help panna mudiyum.';
    case 'singlish':
      return 'Samawenna, mata ReadAura (readaura.lk) poth, orders saha website sambandhawa pamanak udaw kala haka.';
    case 'en':
    default:
      return 'Sorry, I can help you with ReadAura (readaura.lk) books, orders, and website navigation only.';
  }
}

/**
 * Check for deterministic Fast-Path FAQs
 * Returns response string if matched, null if needs book search or AI synthesis
 */
export function getFastPathResponse(query = '', lang = 'en', user = null) {
  const q = query.trim().toLowerCase();

  // 1. Greetings
  if (/^(hi|hello|hey|vanakkam|ayubowan|good\s*(morning|afternoon|evening)|hola|namaste)[\s!.]*$/i.test(q)) {
    if (lang === 'ta') {
      return 'வணக்கம்! ReadAura (readaura.lk)-விற்கு வரவேற்கிறோம். உங்களுக்கு தேவையான புத்தகங்கள், ஆர்டர்கள் அல்லது வலைத்தள உதவி பற்றி என்னிடம் கேட்கலாம்!';
    }
    if (lang === 'si') {
      return 'ආයුබෝවන්! ReadAura (readaura.lk) වෙත ඔබව සාදරයෙන් පිළිගනිමු. ඔබට අවශ්‍ය පොත්පත්, ඇණවුම් හෝ වෙබ් අඩවි උපකාර පිළිබඳව මගෙන් විමසිය හැක!';
    }
    if (lang === 'thanglish') {
      return 'Vanakkam! ReadAura Assistant ingey irukken. Ungalukku vendiya books, orders, illa website details pathi kekaalam!';
    }
    return 'Hello! Welcome to readaura.lk. How can I help you with our books, your orders, or navigating the store today?';
  }

  // 2. How to place an order
  if (/\b(how\s*to\s*order|place\s*an\s*order|order\s*eppadi|order\s*karanne|how\s*to\s*buy)\b/i.test(q)) {
    if (lang === 'ta') {
      return 'புத்தகம் வாங்க எளிய வழிகள்:\n1. புத்தகத்தைத் தேடி "Add to Cart" என்பதைக் கிளிக் செய்யவும்.\n2. உங்கள் Cart-க்குச் சென்று முகவரியை உள்ளிடவும்.\n3. Cash on Delivery அல்லது Bank Transfer முறையைத் தேர்ந்தெடுக்கவும்.\n4. "Place Order via WhatsApp" கிளிக் செய்து உறுதிப்படுத்தவும்!';
    }
    if (lang === 'si') {
      return 'පොතක් ඇණවුම් කිරීමට පියවර:\n1. ඔබට අවශ්‍ය පොත තෝරා "Add to Cart" ක්ලික් කරන්න.\n2. Cart වෙත ගොස් ලිපිනය ඇතුළත් කරන්න.\n3. Cash on Delivery හෝ Bank Transfer තෝරන්න.\n4. "Place Order via WhatsApp" ක්ලික් කර තහවුරු කරන්න!';
    }
    return 'Here is how to place an order on ReadAura (readaura.lk):\n1. Find your book and click "Add to Cart".\n2. Open your Cart and enter your delivery address.\n3. Choose your payment method: Cash on Delivery (COD) or Bank Transfer.\n4. Click "Place Order via WhatsApp" to complete your purchase!';
  }

  // 3. Payment Methods & Bank Transfer
  if (/\b(payment|pay|bank\s*transfer|cod|cash\s*on\s*delivery|panam|mudal)\b/i.test(q) && 
      !/\b(book|price|cost|how\s*much)\b/i.test(q)) {
    if (lang === 'ta') {
      return 'ReadAura (readaura.lk)-வில் பணம் செலுத்தும் முறைகள்:\n• Cash on Delivery (COD) - புத்தகம் வரும்போது பணம் செலுத்தலாம்.\n• Bank Transfer - வங்கிப் பரிமாற்றம் செய்து ரசீதை (Slip) பதிவேற்றலாம்.\nஇலங்கை முழுவதும் துரித விநியோகம் உண்டு!';
    }
    if (lang === 'si') {
      return 'ReadAura (readaura.lk) ගෙවීම් ක්‍රම:\n• Cash on Delivery (COD) - පොත ලැබුණු පසු මුදල් ගෙවිය හැක.\n• Bank Transfer - බැංකු තැන්පතු කර රිසිට්පත (Slip) upload කළ හැක.\nදිවයින පුරා බෙදාහැරීම ඇත!';
    }
    return 'ReadAura (readaura.lk) payment options:\n• Cash on Delivery (COD): Pay directly when your package arrives.\n• Bank Transfer: Transfer funds and upload the deposit slip during checkout.\nIslandwide secure delivery across Sri Lanka!';
  }

  // 4. Delivery Times & Locations
  if (/\b(delivery|shipping|courier|how\s*long|reach|post)\b/i.test(q) && !/\b(book|price)\b/i.test(q)) {
    if (lang === 'ta') {
      return 'ReadAura (readaura.lk) இலங்கை முழுவதும் உள்ள அனைத்து மாவட்டங்களுக்கும் 2 முதல் 4 வேலை நாட்களுக்குள் விரைவாக புத்தகங்களை விநியோகிக்கிறது.';
    }
    if (lang === 'si') {
      return 'ReadAura (readaura.lk) දිවයින පුරා සියලුම ප්‍රදේශවලට වැඩ කරන දින 2-4ක් ඇතුළත පොත් බෙදාහරියි.';
    }
    return 'ReadAura (readaura.lk) delivers islandwide across all provinces in Sri Lanka within 2 to 4 business days via registered courier.';
  }

  // 5. Contact Information
  if (/\b(contact|phone|whatsapp|call|reach\s*you|customer\s*care|support)\b/i.test(q)) {
    return 'You can contact ReadAura Customer Support directly via WhatsApp at +94 77 445 4785 or click the floating WhatsApp button on the bottom right of the screen.';
  }

  // 6. Account & Login Help
  if (/\b(how\s*to\s*(login|register|sign\s*up)|create\s*account)\b/i.test(q)) {
    return 'To log in or register, click "Login" in the top navigation bar. Enter your phone number to receive your OTP or access your account profile directly!';
  }

  // 7. Order tracking without authentication
  if (/\b(my\s*order|track\s*order|order\s*status|where\s*is\s*my\s*order)\b/i.test(q) && !user) {
    if (lang === 'ta') {
      return 'உங்கள் ஆர்டர் நிலையை (Order Status) சரிபார்க்க, முதலில் உங்கள் ReadAura (readaura.lk) கணக்கில் உள்நுழையவும் (Login).';
    }
    if (lang === 'si') {
      return 'ඔබගේ ඇණවුමේ තත්ත්වය බැලීමට කරුණාකර පළමුව ඔබගේ ReadAura (readaura.lk) ගිණුමට ලොග් වන්න (Login).';
    }
    return 'To check your order status, please log in to your ReadAura (readaura.lk) account first using the "Login" button at the top.';
  }

  return null; // Not a fast-path query; proceed to search/AI
}

/**
 * Extract the search keyword from customer question by stripping question affixes
 */
export function extractSearchKeyword(query = '') {
  let cleaned = query.trim();

  // Strip common multi-word question phrases
  const phrasePatterns = [
    /\b(do\s*you\s*have|can\s*i\s*get|tell\s*me\s*about|looking\s*for|search\s*for|show\s*me|give\s*me|who\s*wrote|how\s*much\s*is|what\s*is\s*the\s*price\s*of)\b/gi,
    /\b(enakku\s*venum|ungalidam\s*irukka|paththi\s*solunga|patthi\s*solunga)\b/gi,
    /\b(mata\s*ona|oyalagaawa\s*thiyenawada|gana\s*kiyada)\b/gi,
  ];

  for (const pattern of phrasePatterns) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // Strip common question words across EN, TA, SI, Thanglish
  const noisePatterns = [
    /\b(is|are|do|does|did|you|i|we|can|could|would|please|the|a|an|book|books|novel|novels|author|by|price|cost|available|have|has|got|in\s*stock|need|want|find|search|tell|me|about|what|where|show|who|wrote|written|any)\b/gi,
    /\b(irukka|irukaa|irukku|kedaikkuma|kidaikkuma|vilai|evlo|solunga|puthagam|pusthakam|potha|poth|enakku|ungalidam|patthi|paththi|venum|vanganum)\b/gi,
    /\b(thiyenawada|thiyeda|thiyenawa|miliya|gana|kiyada|nadda|mata|oyala|puluwanda)\b/gi,
    /[?.,!]+/g
  ];

  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  return cleaned.replace(/\s+/g, ' ').trim();
}
