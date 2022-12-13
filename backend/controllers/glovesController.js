import asyncHandler from 'express-async-handler';
import axios from 'axios';
import https from 'https';
import buildGloveJson from '../utils/buildGloveJson.js';
import * as cheerio from 'cheerio';
import { Semaphore } from 'async-mutex';

axios.defaults.timeout = 30000;
axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });

export const getGlovesAll = asyncHandler(async (req, res) => {
  res.json({ test: 'test' });
});

export const getGlovesCutNegative = asyncHandler(async (req, res) => {
  // initialized with the first webpage to visit

  const glovesMap = new Map();

  const baseUrl = 'https://www.prodirectsport.com';
  const paginationURLsToVisit = [
    'https://www.prodirectsport.com/soccer/l/adults/departments-goalkeeper-gloves/activity-football/',
  ];
  const visitedURLs = [];
  const productURLs = new Set();
  let maxPages = 0;

  // getting max pages//
  const pageHTML = await axios.get(
    'https://www.prodirectsport.com/soccer/l/adults/departments-goalkeeper-gloves/activity-football/'
  );

  const $ = cheerio.load(pageHTML.data);

  $('.pagination__total-page').each((index, element) => {
    maxPages = Number($(element).attr('data-total'));
  });

  // iterating until the queue is empty
  // or the iteration limit is hit
  while (paginationURLsToVisit.length !== 0 && visitedURLs.length <= maxPages) {
    // the current webpage to crawl
    const paginationURL = paginationURLsToVisit.pop();

    // retrieving the HTML content from paginationURL
    const pageHTML = await axios.get(paginationURL);

    // adding the current webpage to the
    // web pages already crawled
    visitedURLs.push(paginationURL);

    // initializing cheerio on the current webpage
    const $ = cheerio.load(pageHTML.data);

    // retrieving the pagination URLs
    $('.pagination a').each((index, element) => {
      const hrefURL = $(element).attr('href');
      const paginationURL = `${baseUrl}${hrefURL}`;
      // adding the pagination URL to the queue
      // of web pages to crawl, if it wasn't yet crawled
      if (
        !visitedURLs.includes(paginationURL) &&
        !paginationURLsToVisit.includes(paginationURL)
      ) {
        paginationURLsToVisit.push(paginationURL);
      }
    });

    // retrieving the product URLs
    $('.product-thumb a').each((index, element) => {
      const productURL = $(element).attr('href');
      productURLs.add(productURL);
    });

    $('.product-thumb').each((index, element) => {
      let productURL = '';
      $(element)
        .find('a')
        .each(function (index, element) {
          productURL = $(element).attr('href');
          glovesMap.set(productURL, { image: '', name: '', price: '' });
        });

      $(element)
        .find('img')
        .each(function (index, element) {
          const productImage = $(element).attr('data-src');
          glovesMap.get(productURL).image = productImage;
        });

      $(element)
        .find('.product-thumb__name')
        .each(function (index, element) {
          const productName = $(element).text();
          glovesMap.get(productURL).name = productName;
        });

      $(element)
        .find('a')
        .each(function (index, element) {
          const productData = JSON.parse($(element).attr('data-gtmi'));
          const productPrice = productData.price;
          glovesMap.get(productURL).price = productPrice;
        });
    });
  }

  const URLs = [...productURLs];
  // getting jsons for each product

  const config = {
    headers: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'max-age=0',
      Connection: 'keep-alive',
      'cp-extension-installed': 'Yes',
      'sec-ch-ua':
        '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': 'Windows',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    },
  };

  (async () => {
    const resArray = [];
    const resNewArray = [];

    // allow two concurrent requests (adjust for however many are required)
    const semaphore = new Semaphore(20);

    await Promise.allSettled(
      URLs.map(async (url, idx) => {
        // acquire the semaphore
        const [value, release] = await semaphore.acquire();
        // at this point the semaphore has been acquired and the job needs to be done
        try {
          console.log(`sending request ${idx}...`);
          const response = await axios.get(url, config);
          if (response.status === 200) {
            resArray.push({
              url: url,
              features: buildGloveJson(response.data),
            });
          } else {
            console.log(`request failed with status code ${response.status}`);
          }
        } catch (error) {
          console.log('request failed.');
        } finally {
          console.log(`request ${idx} done...`);
          // release the semaphore again so a new request can be issued
          release();
        }
      })
    );

    for (let i = 0; i < resArray.length; i++) {
      let cleanStr = resArray[i].features;
      cleanStr = cleanStr.replaceAll('•', ' ');
      cleanStr = cleanStr.replaceAll('\t', ' ');
      cleanStr = cleanStr.replaceAll('\n', ' ');
      cleanStr = cleanStr.replaceAll(':', ' ');
      cleanStr = cleanStr.replace(/\s\s+/g, ' ');
      cleanStr = cleanStr.trim();

      if (
        cleanStr.toLowerCase().indexOf('negative') > -1 &&
        cleanStr.toLowerCase().indexOf('roll') === -1 &&
        cleanStr.toLowerCase().indexOf('half') === -1 &&
        cleanStr.toLowerCase().indexOf('hybrid') === -1
      ) {
        resNewArray.push({
          url: resArray[i].url,
          features: cleanStr,
          image: glovesMap.get(resArray[i].url).image,
          name: glovesMap.get(resArray[i].url).name,
          price: glovesMap.get(resArray[i].url).price,
        });
      }
    }
    console.log('Products Count: ' + URLs.length);
    console.log('Request Success: ' + resArray.length);
    console.log('Query Result: ' + resNewArray.length);
    res.json(resNewArray);
  })();
});

export const getGlovesBackhandLatexNeoprene = asyncHandler(async (req, res) => {
  // initialized with the first webpage to visit

  const glovesMap = new Map();

  const baseUrl = 'https://www.prodirectsport.com';
  const paginationURLsToVisit = [
    'https://www.prodirectsport.com/soccer/l/adults/departments-goalkeeper-gloves/activity-football/',
  ];
  const visitedURLs = [];
  const productURLs = new Set();
  let maxPages = 0;

  // getting max pages//
  const pageHTML = await axios.get(
    'https://www.prodirectsport.com/soccer/l/adults/departments-goalkeeper-gloves/activity-football/'
  );

  const $ = cheerio.load(pageHTML.data);

  $('.pagination__total-page').each((index, element) => {
    maxPages = Number($(element).attr('data-total'));
  });

  // iterating until the queue is empty
  // or the iteration limit is hit
  while (paginationURLsToVisit.length !== 0 && visitedURLs.length <= maxPages) {
    // the current webpage to crawl
    const paginationURL = paginationURLsToVisit.pop();

    // retrieving the HTML content from paginationURL
    const pageHTML = await axios.get(paginationURL);

    // adding the current webpage to the
    // web pages already crawled
    visitedURLs.push(paginationURL);

    // initializing cheerio on the current webpage
    const $ = cheerio.load(pageHTML.data);

    // retrieving the pagination URLs
    $('.pagination a').each((index, element) => {
      const hrefURL = $(element).attr('href');
      const paginationURL = `${baseUrl}${hrefURL}`;
      // adding the pagination URL to the queue
      // of web pages to crawl, if it wasn't yet crawled
      if (
        !visitedURLs.includes(paginationURL) &&
        !paginationURLsToVisit.includes(paginationURL)
      ) {
        paginationURLsToVisit.push(paginationURL);
      }
    });

    // retrieving the product URLs
    $('.product-thumb a').each((index, element) => {
      const productURL = $(element).attr('href');
      productURLs.add(productURL);
    });

    $('.product-thumb').each((index, element) => {
      let productURL = '';
      $(element)
        .find('a')
        .each(function (index, element) {
          productURL = $(element).attr('href');
          glovesMap.set(productURL, { image: '', name: '', price: '' });
        });

      $(element)
        .find('img')
        .each(function (index, element) {
          const productImage = $(element).attr('data-src');
          glovesMap.get(productURL).image = productImage;
        });

      $(element)
        .find('.product-thumb__name')
        .each(function (index, element) {
          const productName = $(element).text();
          glovesMap.get(productURL).name = productName;
        });

      $(element)
        .find('a')
        .each(function (index, element) {
          const productData = JSON.parse($(element).attr('data-gtmi'));
          const productPrice = productData.price;
          glovesMap.get(productURL).price = productPrice;
        });
    });
  }

  const URLs = [...productURLs];
  // getting jsons for each product

  const config = {
    headers: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'max-age=0',
      Connection: 'keep-alive',
      'cp-extension-installed': 'Yes',
      'sec-ch-ua':
        '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': 'Windows',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    },
  };

  const checkIfStrContains = (arr, str) => {
    return arr.every((item) => str.toLowerCase().includes(item.toLowerCase()));
  };

  (async () => {
    const resArray = [];
    const resNewArray = [];

    // allow two concurrent requests (adjust for however many are required)
    const semaphore = new Semaphore(20);

    await Promise.allSettled(
      URLs.map(async (url, idx) => {
        // acquire the semaphore
        const [value, release] = await semaphore.acquire();
        // at this point the semaphore has been acquired and the job needs to be done
        try {
          console.log(`sending request ${idx}...`);
          const response = await axios.get(url, config);
          if (response.status === 200) {
            resArray.push({
              url: url,
              features: buildGloveJson(response.data),
            });
          } else {
            console.log(`request failed with status code ${response.status}`);
          }
        } catch (error) {
          console.log('request failed.');
        } finally {
          console.log(`request ${idx} done...`);
          // release the semaphore again so a new request can be issued
          release();
        }
      })
    );

    for (let i = 0; i < resArray.length; i++) {
      let cleanStr = resArray[i].features;
      cleanStr = cleanStr.replaceAll('•', ' ');
      cleanStr = cleanStr.replaceAll('\t', ' ');
      cleanStr = cleanStr.replaceAll('\n', ' ');
      cleanStr = cleanStr.replaceAll(':', ' ');
      cleanStr = cleanStr.replace(/\s\s+/g, ' ');
      cleanStr = cleanStr.trim();

      if (
        cleanStr.toLowerCase().indexOf('backhand') > -1 &&
        cleanStr.toLowerCase().indexOf('latex') > -1 &&
        cleanStr.toLowerCase().indexOf('neoprene') > -1
      ) {
        let splited1 = resArray[i].features.split('\n');
        let splited2 = resArray[i].features.split('• ');

        let wordsArray = ['Backhand', 'latex', 'neoprene'];
        let searchElem1 = splited1.find((element) =>
          checkIfStrContains(wordsArray, element)
        );
        let searchElem2 = splited2.find((element) =>
          checkIfStrContains(wordsArray, element)
        );

        if (searchElem1 || searchElem2) {
          resNewArray.push({
            url: resArray[i].url,
            features: cleanStr,
            image: glovesMap.get(resArray[i].url).image,
            name: glovesMap.get(resArray[i].url).name,
            price: glovesMap.get(resArray[i].url).price,
          });
        }
      }
    }
    console.log('Products Count: ' + URLs.length);
    console.log('Request Success: ' + resArray.length);
    console.log('Query Result: ' + resNewArray.length);
    res.json(resNewArray);
  })();
});

export const getGlovesWristClosureWraparound = asyncHandler(
  async (req, res) => {
    // initialized with the first webpage to visit

    const glovesMap = new Map();

    const baseUrl = 'https://www.prodirectsport.com';
    const paginationURLsToVisit = [
      'https://www.prodirectsport.com/soccer/l/adults/departments-goalkeeper-gloves/activity-football/',
    ];
    const visitedURLs = [];
    const productURLs = new Set();
    let maxPages = 0;

    // getting max pages//
    const pageHTML = await axios.get(
      'https://www.prodirectsport.com/soccer/l/adults/departments-goalkeeper-gloves/activity-football/'
    );

    const $ = cheerio.load(pageHTML.data);

    $('.pagination__total-page').each((index, element) => {
      maxPages = Number($(element).attr('data-total'));
    });

    // iterating until the queue is empty
    // or the iteration limit is hit
    while (
      paginationURLsToVisit.length !== 0 &&
      visitedURLs.length <= maxPages
    ) {
      // the current webpage to crawl
      const paginationURL = paginationURLsToVisit.pop();

      // retrieving the HTML content from paginationURL
      const pageHTML = await axios.get(paginationURL);

      // adding the current webpage to the
      // web pages already crawled
      visitedURLs.push(paginationURL);

      // initializing cheerio on the current webpage
      const $ = cheerio.load(pageHTML.data);

      // retrieving the pagination URLs
      $('.pagination a').each((index, element) => {
        const hrefURL = $(element).attr('href');
        const paginationURL = `${baseUrl}${hrefURL}`;
        // adding the pagination URL to the queue
        // of web pages to crawl, if it wasn't yet crawled
        if (
          !visitedURLs.includes(paginationURL) &&
          !paginationURLsToVisit.includes(paginationURL)
        ) {
          paginationURLsToVisit.push(paginationURL);
        }
      });

      // retrieving the product URLs
      $('.product-thumb a').each((index, element) => {
        const productURL = $(element).attr('href');
        productURLs.add(productURL);
      });

      $('.product-thumb').each((index, element) => {
        let productURL = '';
        $(element)
          .find('a')
          .each(function (index, element) {
            productURL = $(element).attr('href');
            glovesMap.set(productURL, { image: '', name: '', price: '' });
          });

        $(element)
          .find('img')
          .each(function (index, element) {
            const productImage = $(element).attr('data-src');
            glovesMap.get(productURL).image = productImage;
          });

        $(element)
          .find('.product-thumb__name')
          .each(function (index, element) {
            const productName = $(element).text();
            glovesMap.get(productURL).name = productName;
          });

        $(element)
          .find('a')
          .each(function (index, element) {
            const productData = JSON.parse($(element).attr('data-gtmi'));
            const productPrice = productData.price;
            glovesMap.get(productURL).price = productPrice;
          });
      });
    }

    const URLs = [...productURLs];
    // getting jsons for each product

    const config = {
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        Connection: 'keep-alive',
        'cp-extension-installed': 'Yes',
        'sec-ch-ua':
          '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': 'Windows',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
      },
    };

    const checkIfStrContains = (arr, str) => {
      return arr.every((item) =>
        str.toLowerCase().includes(item.toLowerCase())
      );
    };

    (async () => {
      const resArray = [];
      const resNewArray = [];

      // allow two concurrent requests (adjust for however many are required)
      const semaphore = new Semaphore(20);

      await Promise.allSettled(
        URLs.map(async (url, idx) => {
          // acquire the semaphore
          const [value, release] = await semaphore.acquire();
          // at this point the semaphore has been acquired and the job needs to be done
          try {
            console.log(`sending request ${idx}...`);
            const response = await axios.get(url, config);
            if (response.status === 200) {
              resArray.push({
                url: url,
                features: buildGloveJson(response.data),
              });
            } else {
              console.log(`request failed with status code ${response.status}`);
            }
          } catch (error) {
            console.log('request failed.');
          } finally {
            console.log(`request ${idx} done...`);
            // release the semaphore again so a new request can be issued
            release();
          }
        })
      );

      for (let i = 0; i < resArray.length; i++) {
        let cleanStr = resArray[i].features;
        cleanStr = cleanStr.replaceAll('•', ' ');
        cleanStr = cleanStr.replaceAll('\t', ' ');
        cleanStr = cleanStr.replaceAll('\n', ' ');
        cleanStr = cleanStr.replaceAll(':', ' ');
        cleanStr = cleanStr.replace(/\s\s+/g, ' ');
        cleanStr = cleanStr.trim();
        if (
          cleanStr.toLowerCase().indexOf('wrist') > -1 &&
          cleanStr.toLowerCase().indexOf('closure') > -1 &&
          cleanStr.toLowerCase().indexOf('wraparound') > -1
        ) {
          resNewArray.push({
            url: resArray[i].url,
            features: cleanStr,
            image: glovesMap.get(resArray[i].url).image,
            name: glovesMap.get(resArray[i].url).name,
            price: glovesMap.get(resArray[i].url).price,
          });
        }
      }
      console.log('Products Count: ' + URLs.length);
      console.log('Request Success: ' + resArray.length);
      console.log('Query Result: ' + resNewArray.length);
      res.json(resNewArray);
    })();
  }
);
