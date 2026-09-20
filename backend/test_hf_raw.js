import dotenv from 'dotenv';
dotenv.config();

async function testHFRaw() {
  const token = process.env.HF_TOKEN;
  console.log('Testing HF with token:', token ? token.slice(0, 10) + '...' : 'none');

  // Let's test with a simple base64 image (1x1 red pixel or small image)
  const testBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

  const models = ['zai-org/GLM-4.5V', 'Qwen/Qwen2.5-VL-72B-Instruct'];

  for (const model of models) {
    console.log(`\n--- Testing model: ${model} ---`);
    try {
      const start = Date.now();
      const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Read and extract only alphabetic letters (A-Z, a-z) and numeric digits (0-9) visible in this image. Strictly ignore all symbols, special characters, and punctuation.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${testBase64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 200,
          temperature: 0.0
        })
      });

      console.log(`Status: ${res.status}`);
      const text = await res.text();
      console.log('Response body:', text);
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
}

testHFRaw();
