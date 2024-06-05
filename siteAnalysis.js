const axios = require('axios');
const { companies } = require('./companyList');

const analyzeSite = async (url) => {
  try {
    const response = await axios.get(url, { timeout: 5000, maxRedirects: 10 });
    const html = response.data;

    // Extraer el título de la página
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const pageTitle = titleMatch ? titleMatch[1].toLowerCase() : 'No title';

    // Buscar coincidencias en la URL y el título
    const foundCompanies = companies.filter(
      (company) =>
        url.toLowerCase().includes(company.keyword) ||
        pageTitle.includes(company.keyword)
    );

    return foundCompanies.map((company) => company.brand);
  } catch (error) {
    console.error(`Error al analizar la URL: ${error.message}`);
    return [];
  }
};

module.exports = analyzeSite;
