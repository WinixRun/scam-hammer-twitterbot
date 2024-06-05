const axios = require('axios');
const cheerio = require('cheerio');
const companyList = require('../checklists/companyList');
const countryList = require('../checklists/countryList');

const getTitle = async (url) => {
  console.log(`Fetching title for URL: ${url}`);
  try {
    const response = await axios.get(url, { maxRedirects: 10, timeout: 5000 });
    const $ = cheerio.load(response.data);
    const title = $('title').text();
    if (title) {
      console.log(`Title found: ${title}`);
      return title;
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
  let urlCheck = false;
  let titleCheck = false;

  // Check URL against company list
  for (const { keyword, brand } of companyList.companies) {
    if (lowerCaseUrl.includes(keyword)) {
      identifiedBrand = brand;
      urlCheck = true;
      console.log(
        `Keyword "${keyword}" found in URL. Identified brand: ${brand}`
      );
      break;
    }
  }

  // If no brand identified, check the title of the page
  if (!identifiedBrand) {
    const title = await getTitle(url);
    if (title) {
      for (const { keyword, brand } of companyList.companies) {
        if (title.toLowerCase().includes(keyword)) {
          identifiedBrand = brand;
          titleCheck = true;
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

  return { identifiedBrand, urlCheck, titleCheck };
};

const getCountryInfo = (phoneNumber) => {
  if (!phoneNumber.startsWith('+')) {
    return { country: 'España', flag: '🇪🇸' };
  }

  const prefix = phoneNumber.slice(1, 3);
  const country = countryList.find(
    (country) => country.prefix === `+${prefix}`
  );
  return country
    ? { country: country.country, flag: country.flag }
    : { country: 'Desconocido', flag: '❓' };
};

module.exports = { analyzeUrl, getCountryInfo };
