const axios = require('axios');
const companyList = require('./companyList');

const getTitle = async (url) => {
  console.log(`Fetching title for URL: ${url}`);
  try {
    const response = await axios.get(url, { maxRedirects: 10, timeout: 5000 });
    const match = response.data.match(/<title>(.*?)<\/title>/);
    if (match && match[1]) {
      console.log(`Title found: ${match[1]}`);
      return match[1];
    }
  } catch (error) {
    console.error('Error fetching URL title:', error.message);
  }
  return null;
};

const analyzeUrl = async (url) => {
  console.log(`Analyzing URL: ${url}`);
  const lowerCaseUrl = url.toLowerCase();
  let identifiedBrand = null;

  for (const { keyword, brand } of companyList) {
    if (lowerCaseUrl.includes(keyword)) {
      identifiedBrand = brand;
      console.log(
        `Keyword "${keyword}" found in URL. Identified brand: ${brand}`
      );
      break;
    }
  }

  if (!identifiedBrand) {
    const title = await getTitle(url);
    if (title) {
      for (const { keyword, brand } of companyList) {
        if (title.toLowerCase().includes(keyword)) {
          identifiedBrand = brand;
          console.log(
            `Keyword "${keyword}" found in title. Identified brand: ${brand}`
          );
          break;
        }
      }
    }
  }

  if (!identifiedBrand) {
    console.log('No brand identified for the given URL.');
  }
  return identifiedBrand;
};

module.exports = { analyzeUrl };
