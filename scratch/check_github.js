async function check() {
  try {
    const res = await fetch('https://api.github.com/repos/shadchika-shanmugarajah/readora-fronten/commits/main', {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('Latest commit on GitHub shadchika-shanmugarajah/readora-fronten:');
      console.log('  SHA:', data.sha);
      console.log('  Author:', data.commit.author.name);
      console.log('  Message:', data.commit.message);
      console.log('  Date:', data.commit.author.date);
    } else {
      console.log('Failed to fetch from GitHub API:', res.status, res.statusText);
    }
  } catch (err) {
    console.error(err);
  }
}

check();
