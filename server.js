const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 10000;

function filterImages(images) {
  return images.filter(url => !url.toLowerCase().includes('cn') && !url.toLowerCase().includes('chinese'));
}

app.post('/api/product', async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ message: 'Missing product ID' });

  try {
    const cjResponse = await axios.post(
      'https://developers.cjdropshipping.com/api2.0/v1/product/query',
      { pid: productId },
      { headers: { 'CJ-Access-Token': process.env.CJ_ACCESS_TOKEN } }
    );

    if (cjResponse.data.code !== 200) {
      return res.status(500).json({ message: 'Failed to fetch product data from CJ' });
    }

    const product = cjResponse.data.data;
    const title = product.productName || 'Produto incrível';
    const description = product.sellPoint || product.productDesc || 'Descrição não disponível.';
    const images = filterImages(product.productImagePathList || []);

    res.json({
      product: { title, description },
      images
    });
  } catch (err) {
    console.error('CJ API Error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Erro ao buscar produto CJ.' });
  }
});

app.post('/api/generate-copy', async (req, res) => {
  const { product, tone } = req.body;
  if (!product || !product.title || !product.description) {
    return res.status(400).json({ message: 'Dados do produto incompletos' });
  }

  const tonePromptMap = {
    vibrante: "texto de vendas vibrante e persuasivo",
    divertido: "texto de vendas divertido, descontraído e carismático",
    formal: "texto de vendas formal, profissional e confiável"
  };
  const tonePrompt = tonePromptMap[tone] || tonePromptMap.vibrante;

  try {
    const aiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'Você é um redator publicitário especialista em conversão de vendas.' },
          { role: 'user', content: `Crie um ${tonePrompt} para este produto: ${product.title}. Descrição: ${product.description}. Foque em quebrar objeções, gerar confiança e converter compradores da Geração Z.` }
        ],
        max_tokens: 500
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );

    const generatedText = aiResponse.data.choices[0].message.content;
    res.json({ copy: generatedText });
  } catch (err) {
    console.error('OpenAI Error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Erro ao gerar copy.' });
  }
});

app.post('/api/create-page', async (req, res) => {
  const { product, images, copy } = req.body;
  if (!product || !product.title || !copy) {
    return res.status(400).json({ message: 'Dados insuficientes para criar página' });
  }

  try {
    const shopifyResponse = await axios.post(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2023-04/pages.json`,
      {
        page: {
          title: product.title,
          body_html: images.map(url => `<img src="${url}" alt="${product.title}" />`).join('') + `<p>${copy}</p>`
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    const createdPage = shopifyResponse.data.page;
    const pageUrl = `https://${process.env.SHOPIFY_STORE_URL}/pages/${createdPage.handle}`;
    res.json({ page_url: pageUrl });
  } catch (err) {
    console.error('Shopify Error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Erro ao criar página no Shopify.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
