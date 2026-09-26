async function search() {
  const url = 'https://readoraa.vercel.app/assets/index-B3N2FnQ4.js';
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log('File size:', text.length);
    
    // Find all occurrences of onrender.com
    const matches = text.match(/https?:\/\/[^\s"'`}]*onrender\.com[^\s"'`}]*/g);
    console.log('Matches for onrender.com:', matches);
  } catch (err) {
    console.error(err);
  }
}

search();
