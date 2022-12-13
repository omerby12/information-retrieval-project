import * as cheerio from 'cheerio';

const buildGloveJson = (reqResult) => {
  const $ = cheerio.load(reqResult);
  let features = '';
  $('.ml-tab-content__body').each((index, element) => {
    if ($(element).prev().text() === 'Features') {
      features = $(element).text();
    }
  });

  return features;
};

export default buildGloveJson;
