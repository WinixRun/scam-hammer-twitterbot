const axios = require('axios');
const cheerio = require('cheerio');
const companyList = require('../checklists/companyList');
const countryList = require('../checklists/countryList');

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
  let urlCheck = false;
  let titleCheck = false;

  for (const { keyword, brand } of companyList) {
    if (lowerCaseUrl.includes(keyword)) {
      identifiedBrand = brand;
      urlCheck = true;
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

  const country = countryList.find((country) =>
    phoneNumber.startsWith(country.prefix)
  );
  return country
    ? { country: country.country, flag: country.flag }
    : { country: 'Desconocido', flag: '❓' };
};

const extractDomain = (url) => {
  const domain = new URL(url).hostname;
  return domain;
};

module.exports = { analyzeUrl, getCountryInfo, extractDomain };
