
     (function() {
      'use strict';

      // ============================================================
      // 1. BIBLE API INTEGRATION LAYER
      // ============================================================
      
      const BIBLE_API_BASE = 'https://bible-api.com/data/web';
      const API_DEBOUNCE_MS = 500;
      let apiCallQueue = [];
      let isApiCalling = false;
      let apiCache = {};

      /**
       * Fetch a name from the Bible API
       * @param {string} name - The name to search for
       * @returns {Promise<Object|null>} - Returns { name, books, verses } or null
       */
      async function fetchBibleName(name) {
        // Check cache first
        if (apiCache[name]) {
          return apiCache[name];
        }

        try {
          const response = await fetch(`${BIBLE_API_BASE}/?search=${encodeURIComponent(name)}&translation=kjv`);
          if (!response.ok) return null;
          
          const data = await response.json();
          
          if (data.verses && data.verses.length > 0) {
            // Extract unique book names from verses
            const books = [...new Set(data.verses.map(v => v.book_name))];
            const result = {
              name: name,
              books: books,
              verses: data.verses.slice(0, 3).map(v => ({
                book: v.book_name,
                chapter: v.chapter,
                verse: v.verse,
                text: v.text
              }))
            };
            // Cache the result
            apiCache[name] = result;
            return result;
          }
          return null;
        } catch (error) {
          console.warn('Bible API error:', error);
          return null;
        }
      }

      /**
       * Enhanced name lookup with API fallback
       * @param {string} nameLower - Lowercase name to look up
       * @returns {Promise<Object>} - { found: boolean, books: string[], source: 'local'|'api'|'none', verses?: [] }
       */
      async function lookupNameWithAPI(nameLower) {
        // 1. Check local DB first
        const localMatch = getEntryBooks(nameLower);
        if (localMatch) {
          return {
            found: true,
            books: localMatch,
            source: 'local'
          };
        }

        // 2. Query API
        showApiLoading(true);
        const apiResult = await fetchBibleName(nameLower);
        showApiLoading(false);

        if (apiResult && apiResult.books.length > 0) {
          // 3. Cache to local DB for future use
          addNameToLocalDB(nameLower, apiResult.books);
          return {
            found: true,
            books: apiResult.books,
            source: 'api',
            verses: apiResult.verses
          };
        }

        return {
          found: false,
          books: [],
          source: 'none'
        };
      }

      /**
       * Add a name to the local database (dynamic extension)
       * @param {string} name - The name to add
       * @param {string[]} books - Array of book names
       */
      function addNameToLocalDB(name, books) {
        if (!FALLBACK_NAMES[name]) {
          FALLBACK_NAMES[name] = books;
          // Update first-letter index
          const firstLetter = name.charAt(0).toLowerCase();
          if (NameIndexByFirstLetter[firstLetter]) {
            if (!NameIndexByFirstLetter[firstLetter].includes(name)) {
              NameIndexByFirstLetter[firstLetter].push(name);
            }
          }
          // Update book indexes
          books.forEach(book => {
            if (NameIndexByBook[book]) {
              if (!NameIndexByBook[book].includes(name)) {
                NameIndexByBook[book].push(name);
              }
            }
          });
          // Save to localStorage for persistence
          saveNameToStorage(name, books);
        }
      }

      /**
       * Persist dynamically added names to localStorage
       */
      function saveNameToStorage(name, books) {
        try {
          const stored = JSON.parse(localStorage.getItem('taw_api_cache') || '{}');
          stored[name] = books;
          localStorage.setItem('taw_api_cache', JSON.stringify(stored));
        } catch (e) {
          // Silent fail
        }
      }

      /**
       * Load cached API results from localStorage
       */
      function loadApiCache() {
        try {
          const stored = JSON.parse(localStorage.getItem('taw_api_cache') || '{}');
          for (const [name, books] of Object.entries(stored)) {
            if (!FALLBACK_NAMES[name]) {
              FALLBACK_NAMES[name] = books;
              const firstLetter = name.charAt(0).toLowerCase();
              if (NameIndexByFirstLetter[firstLetter]) {
                if (!NameIndexByFirstLetter[firstLetter].includes(name)) {
                  NameIndexByFirstLetter[firstLetter].push(name);
                }
              }
              books.forEach(book => {
                if (NameIndexByBook[book]) {
                  if (!NameIndexByBook[book].includes(name)) {
                    NameIndexByBook[book].push(name);
                  }
                }
              });
            }
          }
        } catch (e) {
          // Silent fail
        }
      }

      /**
       * Show/hide API loading state on input
       */
      function showApiLoading(loading) {
        if (loading) {
          canvasInput.classList.add('api-loading');
          canvasInput.placeholder = 'Searching Bible...';
        } else {
          canvasInput.classList.remove('api-loading');
          canvasInput.placeholder = 'Type Next Name...';
        }
      }

      // ============================================================
      // 2. FULL BIBLICAL NAME DATABASE (Local)
      // ============================================================
      const BOOKS = [
        "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
        "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
        "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
        "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah",
        "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
        "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
        "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts",
        "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
        "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
        "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
        "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
      ];

      const SHORT_BOOKS = new Set([
        'Obadiah', 'Jude', 'Jonah', 'Nahum', 'Habakkuk', 'Zephaniah',
        'Haggai', 'Malachi', 'Philemon', '2 John', '3 John', 'Ruth', 'Esther'
      ]);

      const STARTER_NAMES = ["Adam", "Abraham", "Moses", "David", "Isaiah", "Daniel", "Peter", "Paul", "Ruth", "John"];

      // These will be extended dynamically via API
let FALLBACK_NAMES = {
  // ===== OLD TESTAMENT NAMES =====
  "aaron": ["Exodus", "Leviticus", "Numbers", "Deuteronomy"],
  "abdon": ["Judges", "1 Chronicles"],
  "abednego": ["Daniel"],
  "abel": ["Genesis", "Hebrews", "1 John"],
  "abiah": ["1 Samuel", "1 Kings", "1 Chronicles", "Nehemiah"],
  "abiasaph": ["Exodus", "1 Chronicles"],
  "abigail": ["1 Samuel", "1 Chronicles", "2 Samuel"],
  "abihail": ["Numbers", "1 Chronicles", "Esther"],
  "abihu": ["Exodus", "Leviticus", "Numbers"],
  "abijah": ["1 Kings", "2 Chronicles", "Nehemiah"],
  "abimael": ["Genesis", "1 Chronicles"],
  "abimelech": ["Genesis", "Judges", "2 Samuel", "1 Chronicles"],
  "abinadab": ["1 Samuel", "2 Samuel", "1 Chronicles"],
  "abinoam": ["Judges"],
  "abiram": ["Numbers", "1 Kings"],
  "abishag": ["1 Kings"],
  "abishai": ["1 Samuel", "2 Samuel", "1 Chronicles"],
  "abishua": ["1 Chronicles", "Ezra"],
  "abital": ["2 Samuel"],
  "abitub": ["1 Chronicles"],
  "abner": ["1 Samuel", "2 Samuel", "1 Kings", "1 Chronicles"],
  "abraham": ["Genesis", "Matthew", "Luke", "Romans", "Galatians", "Hebrews", "James"],
  "absalom": ["2 Samuel", "1 Kings", "1 Chronicles"],
  "achan": ["Joshua"],
  "achaz": ["2 Kings"],
  "achbor": ["2 Kings", "2 Chronicles"],
  "achim": ["Matthew"],
  "achish": ["1 Samuel", "1 Kings"],
  "achsa": ["Joshua", "1 Chronicles"],
  "achshaph": ["Joshua"],
  "ada": ["Genesis", "1 Chronicles"],
  "adah": ["Genesis"],
  "adad": ["1 Kings", "1 Chronicles"],
  "adalia": ["Esther"],
  "adam": ["Genesis", "1 Chronicles", "Luke", "Romans", "1 Corinthians", "1 Timothy", "Jude"],
  "adan": ["Ezra", "Nehemiah"],
  "adbeel": ["Genesis", "1 Chronicles"],
  "addar": ["Joshua", "1 Chronicles"],
  "addi": ["Luke"],
  "addon": ["Nehemiah"],
  "adel": ["Ezra"],
  "aden": ["Ezra"],
  "adiel": ["1 Chronicles"],
  "adin": ["Ezra", "Nehemiah"],
  "adina": ["1 Chronicles"],
  "adino": ["2 Samuel"],
  "adithaim": ["Joshua"],
  "adlai": ["1 Chronicles"],
  "adna": ["Ezra", "Nehemiah"],
  "adnah": ["1 Chronicles"],
  "adoni-bezek": ["Judges"],
  "adoni-zedek": ["Joshua"],
  "adonijah": ["2 Samuel", "1 Kings", "1 Chronicles"],
  "adonikam": ["Ezra", "Nehemiah"],
  "adoniran": ["1 Kings"],
  "adoram": ["2 Samuel", "1 Kings"],
  "adrammelech": ["2 Kings"],
  "adriel": ["1 Samuel", "1 Chronicles"],
  "adu": ["Ezra"],
  "adullam": ["Joshua", "1 Samuel"],
  "adyah": ["2 Kings"],
  "aeneas": ["Acts"],
  "agabus": ["Acts"],
  "agag": ["Numbers", "1 Samuel", "Esther"],
  "agarenes": ["1 Chronicles"],
  "agrippa": ["Acts"],
  "ahab": ["1 Kings", "2 Kings"],
  "ahar": ["1 Chronicles"],
  "aharah": ["1 Chronicles"],
  "ahasai": ["Nehemiah"],
  "ahasbai": ["2 Samuel"],
  "ahasuerus": ["Ezra", "Esther", "Daniel"],
  "ahaz": ["2 Kings", "2 Chronicles", "Isaiah", "Hosea"],
  "ahaziah": ["1 Kings", "2 Kings", "2 Chronicles"],
  "ahban": ["1 Chronicles"],
  "aher": ["1 Chronicles"],
  "ahian": ["1 Chronicles"],
  "ahiezer": ["Numbers", "1 Chronicles"],
  "ahihud": ["Numbers", "1 Chronicles"],
  "ahijah": ["1 Kings", "1 Chronicles"],
  "ahikam": ["2 Kings", "Jeremiah"],
  "ahim": ["1 Chronicles"],
  "ahimaaz": ["1 Samuel", "2 Samuel", "1 Kings"],
  "ahiman": ["Numbers", "Joshua", "Judges"],
  "ahimelech": ["1 Samuel", "2 Samuel", "1 Chronicles", "Psalms"],
  "ahinadab": ["1 Kings"],
  "ahinoam": ["1 Samuel", "2 Samuel"],
  "ahio": ["2 Samuel", "1 Chronicles"],
  "ahira": ["Numbers"],
  "ahishahar": ["1 Chronicles"],
  "ahishar": ["1 Kings"],
  "ahithophel": ["2 Samuel", "1 Chronicles", "Psalms"],
  "ahitub": ["1 Samuel", "2 Samuel", "1 Kings", "1 Chronicles"],
  "ahliab": ["Exodus"],
  "ahoad": ["1 Chronicles"],
  "ahoh": ["1 Chronicles"],
  "ahumai": ["1 Chronicles"],
  "ahuzzam": ["1 Chronicles"],
  "ahuzzath": ["Genesis"],
  "aiah": ["2 Samuel", "1 Chronicles"],
  "aiath": ["Isaiah"],
  "aijalon": ["Joshua", "Judges", "1 Chronicles"],
  "aijeleth": ["Psalms"],
  "ain": ["Numbers", "Joshua"],
  "aja": ["1 Chronicles"],
  "akka": ["Joshua"],
  "akku": ["Nehemiah"],
  "akub": ["Ezra", "Nehemiah"],
  "akzib": ["Joshua", "Judges", "Genesis"],
  "alah": ["Ezra"],
  "alexander": ["Mark", "Acts", "1 Timothy"],
  "aliah": ["1 Chronicles"],
  "alion": ["1 Chronicles"],
  "allammelech": ["Joshua"],
  "allaph": ["1 Chronicles"],
  "allem": ["Joshua"],
  "allot": ["Joshua"],
  "almodad": ["Genesis", "1 Chronicles"],
  "aloth": ["1 Kings"],
  "alphaeus": ["Matthew", "Mark", "Luke"],
  "alvah": ["Genesis", "1 Chronicles"],
  "alvan": ["Genesis", "1 Chronicles"],
  "amad": ["Joshua"],
  "amal": ["1 Chronicles"],
  "amalek": ["Genesis", "Exodus", "Numbers", "Deuteronomy", "1 Samuel", "1 Chronicles"],
  "amariah": ["1 Chronicles", "2 Chronicles", "Nehemiah", "Zephaniah"],
  "amasa": ["2 Samuel", "1 Kings", "1 Chronicles"],
  "amasai": ["1 Chronicles"],
  "amashai": ["Nehemiah"],
  "amaziah": ["2 Kings", "2 Chronicles", "Amos", "Zechariah"],
  "amdu": ["Genesis"],
  "amelius": ["Acts"],
  "ami": ["Ezra", "Nehemiah"],
  "amiel": ["Numbers", "2 Samuel", "1 Chronicles"],
  "aminadab": ["Ruth", "1 Chronicles", "Matthew", "Luke"],
  "amittai": ["2 Kings", "Jonah"],
  "amminadab": ["Exodus", "Ruth", "1 Chronicles", "Matthew"],
  "amminadib": ["Song of Solomon"],
  "amminhu": ["Numbers"],
  "ammishaddai": ["Numbers"],
  "ammizabad": ["1 Chronicles"],
  "amnon": ["2 Samuel", "1 Chronicles"],
  "amok": ["Nehemiah"],
  "amon": ["1 Kings", "2 Kings", "2 Chronicles", "Jeremiah"],
  "amor": ["Genesis"],
  "amos": ["Amos", "2 Kings", "1 Chronicles"],
  "amoz": ["2 Kings", "Isaiah"],
  "amphipolis": ["Acts"],
  "amram": ["Exodus", "Numbers", "1 Chronicles"],
  "amraphel": ["Genesis"],
  "amu": ["Nehemiah"],
  "anab": ["Joshua"],
  "anah": ["Genesis", "Joshua", "1 Chronicles"],
  "anaharath": ["Joshua"],
  "ananiah": ["Nehemiah"],
  "ananias": ["Acts"],
  "anath": ["Judges"],
  "anathoth": ["1 Chronicles", "Jeremiah", "Nehemiah"],
  "aniah": ["Nehemiah"],
  "annas": ["Luke", "John", "Acts"],
  "antipas": ["Revelation"],
  "antothijah": ["1 Chronicles"],
  "anub": ["1 Chronicles"],
  "appaim": ["1 Chronicles"],
  "apollos": ["Acts", "1 Corinthians", "Titus"],
  "aquila": ["Acts", "Romans", "1 Corinthians", "2 Timothy"],
  "ar": ["Numbers"],
  "ara": ["1 Chronicles"],
  "arab": ["Joshua"],
  "aram": ["Genesis", "Numbers", "1 Chronicles", "Ruth", "Matthew", "Luke"],
  "ararat": ["2 Kings"],
  "arau": ["1 Chronicles"],
  "arba": ["Joshua"],
  "archelaus": ["Matthew"],
  "archippus": ["Colossians", "Philemon"],
  "ard": ["Genesis", "Numbers"],
  "ardon": ["1 Chronicles"],
  "areli": ["Genesis", "Numbers"],
  "ares": ["Acts"],
  "aretas": ["2 Corinthians"],
  "aridai": ["Esther"],
  "aridatha": ["Esther"],
  "arieh": ["2 Kings"],
  "ariel": ["Ezra", "Isaiah"],
  "arioch": ["Genesis", "Daniel"],
  "arisai": ["Esther"],
  "aristarchus": ["Acts", "Colossians", "Philemon"],
  "aristobulus": ["Romans"],
  "armoni": ["2 Samuel"],
  "arnan": ["1 Chronicles"],
  "arnon": ["Numbers", "Deuteronomy", "Joshua"],
  "arob": ["Judges"],
  "arphaxad": ["Genesis", "1 Chronicles", "Luke"],
  "arta": ["Esther"],
  "artaxerxes": ["Ezra", "Nehemiah"],
  "artemas": ["Titus"],
  "arubboth": ["1 Kings"],
  "aruel": ["Numbers"],
  "arunah": ["2 Samuel"],
  "arza": ["1 Kings"],
  "asadias": ["1 Esdras"],
  "asaph": ["1 Chronicles", "2 Chronicles", "Nehemiah", "Psalms"],
  "asareel": ["1 Chronicles"],
  "asariah": ["1 Chronicles"],
  "asarel": ["1 Chronicles"],
  "asbek": ["1 Chronicles"],
  "asdod": ["Joshua", "1 Samuel"],
  "asdoth": ["Joshua"],
  "asebe": ["1 Chronicles"],
  "asena": ["Genesis"],
  "ashah": ["Joshua"],
  "ashan": ["Joshua", "1 Chronicles"],
  "ashar": ["1 Chronicles"],
  "ashbel": ["Genesis", "Numbers", "1 Chronicles"],
  "ashdod": ["Joshua", "1 Samuel", "2 Chronicles", "Nehemiah", "Isaiah", "Zechariah"],
  "asher": ["Genesis", "Exodus", "Numbers", "Deuteronomy", "Joshua", "1 Chronicles", "Luke"],
  "ashima": ["2 Kings"],
  "ashkan": ["1 Chronicles"],
  "ashkelo": ["Judges"],
  "ashkelon": ["Judges", "1 Samuel", "Zephaniah", "Zechariah"],
  "ashkenaz": ["Genesis", "1 Chronicles"],
  "ashnap": ["Ezra"],
  "ashpenaz": ["Daniel"],
  "ashri": ["1 Chronicles"],
  "ashtoreth": ["1 Kings", "2 Kings"],
  "ashur": ["1 Chronicles"],
  "ashvath": ["1 Chronicles"],
  "asia": ["Acts", "Romans", "1 Corinthians", "2 Corinthians", "2 Timothy", "1 Peter", "Revelation"],
  "asiel": ["1 Chronicles"],
  "asnah": ["Ezra", "Nehemiah"],
  "asnath": ["Genesis"],
  "ason": ["Joshua"],
  "asor": ["Joshua"],
  "aspatha": ["Esther"],
  "astaroth": ["1 Chronicles"],
  "asuppim": ["1 Chronicles"],
  "asvath": ["1 Chronicles"],
  "athach": ["1 Samuel"],
  "athaliah": ["2 Kings", "2 Chronicles"],
  "athar": ["1 Chronicles"],
  "athoth": ["Nehemiah"],
  "attai": ["1 Chronicles"],
  "attalah": ["Nehemiah"],
  "attarus": ["1 Chronicles"],
  "augustus": ["Luke"],
  "avith": ["Genesis"],
  "avva": ["2 Kings"],
  "azaliah": ["2 Kings"],
  "azaniah": ["Nehemiah"],
  "azariah": ["1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Daniel"],
  "azarel": ["Nehemiah"],
  "aze": ["1 Chronicles"],
  "azel": ["1 Chronicles"],
  "azem": ["Joshua"],
  "azen": ["Numbers"],
  "azgad": ["Ezra", "Nehemiah"],
  "aziel": ["1 Chronicles"],
  "aziza": ["Ezra"],
  "azmaveth": ["2 Samuel", "1 Chronicles", "Nehemiah"],
  "azmon": ["Numbers", "Joshua"],
  "aznoth": ["Joshua"],
  "azor": ["Matthew"],
  "azotus": ["Acts"],
  "azriel": ["1 Chronicles", "Jeremiah"],
  "azrikam": ["1 Chronicles", "2 Chronicles", "Nehemiah"],
  "azubah": ["1 Kings", "1 Chronicles"],
  "azur": ["Jeremiah"],
  "azusa": ["1 Chronicles"],
  "azvav": ["Nehemiah"],
  "azzan": ["Numbers"],
  "azzur": ["Nehemiah", "Jeremiah"],
  
  // ===== NEW TESTAMENT NAMES =====
  "andrew": ["Matthew", "Mark", "John"],
  "anna": ["Luke"],
  "annanias": ["Acts"],
  "anthony": ["Acts"],
  "apollonius": ["Acts"],
  "aristarchus": ["Acts", "Colossians"],
  "barnabas": ["Acts", "1 Corinthians", "Galatians", "Colossians"],
  "bartimaeus": ["Mark"],
  "baruch": ["Jeremiah", "Nehemiah"],
  "bernice": ["Acts"],
  "caiaphas": ["Matthew", "Luke", "John", "Acts"],
  "candace": ["Acts"],
  "clement": ["Philippians"],
  "cleopas": ["Luke"],
  "crescens": ["2 Timothy"],
  "crispus": ["Acts", "1 Corinthians"],
  "damaris": ["Acts"],
  "darius": ["Daniel", "Ezra", "Nehemiah", "Haggai"],
  "demetrius": ["Acts", "3 John"],
  "dionysius": ["Acts"],
  "diotrephes": ["3 John"],
  "drusilla": ["Acts"],
  "elymas": ["Acts"],
  "enoch": ["Genesis", "Hebrews", "Jude"],
  "epaphras": ["Colossians", "Philemon"],
  "epaphroditus": ["Philippians"],
  "erastus": ["Acts", "Romans", "2 Timothy"],
  "euodia": ["Philippians"],
  "eutychus": ["Acts"],
  "felix": ["Acts"],
  "festus": ["Acts"],
  "gallio": ["Acts"],
  "gaius": ["Acts", "Romans", "1 Corinthians", "3 John"],
  "gamaliel": ["Acts"],
  "jesus": ["Matthew", "Mark", "Luke", "John", "Acts", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"],
  "joseph": ["Genesis", "Matthew", "Luke", "John", "Acts"],
  "joses": ["Matthew", "Mark"],
  "joshua": ["Exodus", "Numbers", "Deuteronomy", "Joshua", "Judges", "1 Chronicles", "Nehemiah", "Haggai", "Acts", "Hebrews"],
  "josiah": ["1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Jeremiah", "Zephaniah"],
  "judah": ["Genesis", "Exodus", "Numbers", "Joshua", "Judges", "1 Chronicles", "2 Chronicles", "Nehemiah", "Psalms", "Jeremiah", "Ezekiel", "Matthew", "Luke", "Hebrews", "Revelation"],
  "jude": ["Jude", "Luke", "Acts"],
  "julius": ["Acts"],
  "justus": ["Acts", "Colossians"],
  "lazarus": ["John"],
  "linus": ["2 Timothy"],
  "lucius": ["Acts", "Romans"],
  "lydia": ["Acts"],
  "malchus": ["John"],
  "matthias": ["Acts"],
  "mnason": ["Acts"],
  "narcissus": ["Romans"],
  "nicolas": ["Acts"],
  "niger": ["Acts"],
  "olympas": ["Romans"],
  "onesiphorus": ["2 Timothy"],
  "pamphylia": ["Acts"],
  "parmenas": ["Acts"],
  "patrobas": ["Romans"],
  "paul": ["Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "2 Peter"],
  "philemon": ["Philemon"],
  "philip": ["Matthew", "Mark", "Luke", "John", "Acts"],
  "phoebe": ["Romans"],
  "porcius": ["Acts"],
  "pudens": ["2 Timothy"],
  "quartus": ["Romans"],
  "rhoda": ["Acts"],
  "sapphira": ["Acts"],
  "sergius": ["Acts"],
  "silas": ["Acts", "1 Peter"],
  "sosipater": ["Romans"],
  "sosthenes": ["Acts", "1 Corinthians"],
  "stephen": ["Acts"],
  "syntyche": ["Philippians"],
  "tertius": ["Romans"],
  "timothy": ["Acts", "Romans", "1 Corinthians", "2 Corinthians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Philemon", "Hebrews"],
  "titus": ["2 Corinthians", "Galatians", "2 Timothy", "Titus"],
  "tychicus": ["Acts", "Ephesians", "Colossians", "2 Timothy", "Titus"],
  "urbanus": ["Romans"],
  "zenia": ["Titus"],
  "zacharias": ["2 Chronicles", "Ezra", "Isaiah", "Zechariah", "Matthew", "Luke"],
  "zaccai": ["Ezra", "Nehemiah"],
  "zachariah": ["1 Chronicles", "2 Chronicles", "Ezra", "Isaiah", "Zechariah", "Matthew"],
  "zacher": ["1 Chronicles"],
  "zadok": ["2 Samuel", "1 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Ezekiel"],
  "zaham": ["2 Chronicles"],
  "zair": ["2 Kings"],
  "zakeus": ["Luke"],
  "zamzummim": ["Deuteronomy"],
  "zanoah": ["Joshua", "Nehemiah"],
  "zaphnath": ["Genesis"],
  "zara": ["Genesis", "1 Chronicles", "Matthew"],
  "zebadiah": ["1 Chronicles", "2 Chronicles", "Ezra"],
  "zebah": ["Judges"],
  "zebul": ["Judges"],
  "zebulun": ["Genesis", "Exodus", "Numbers", "Deuteronomy", "Joshua", "Judges", "1 Chronicles", "2 Chronicles", "Ezekiel", "Revelation"],
  "zechariah": ["2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Isaiah", "Zechariah", "Matthew", "Luke"],
  "zedekiah": ["1 Kings", "1 Chronicles", "2 Chronicles", "Jeremiah", "Ezekiel"],
  "zeeb": ["Judges"],
  "zelah": ["Joshua"],
  "zelek": ["2 Samuel"],
  "zelophehad": ["Numbers", "Joshua", "1 Chronicles"],
  "zelotes": ["Luke", "Acts"],
  "zemaraim": ["Joshua", "2 Chronicles"],
  "zemira": ["1 Chronicles"],
  "zenan": ["Joshua"],
  "zephaniah": ["2 Kings", "Zephaniah", "Zechariah"],
  "zephi": ["Genesis", "1 Chronicles"],
  "zephon": ["Genesis", "Numbers"],
  "zerah": ["Genesis", "Numbers", "Joshua", "1 Chronicles", "Nehemiah", "Matthew"],
  "zeresh": ["Esther"],
  "zereth": ["1 Chronicles"],
  "zeror": ["1 Samuel"],
  "zeruah": ["1 Kings"],
  "zerubbabel": ["1 Chronicles", "Ezra", "Nehemiah", "Haggai", "Zechariah", "Matthew", "Luke"],
  "zeruiah": ["1 Samuel", "2 Samuel", "1 Kings", "1 Chronicles"],
  "zetham": ["1 Chronicles"],
  "zethar": ["Esther"],
  "zia": ["1 Chronicles"],
  "ziba": ["2 Samuel", "2 Kings"],
  "zibiah": ["2 Kings", "2 Chronicles"],
  "zichri": ["Exodus", "1 Chronicles", "2 Chronicles", "Nehemiah"],
  "zidkijah": ["Nehemiah", "Jeremiah"],
  "ziha": ["Ezra", "Nehemiah"],
  "ziklag": ["Joshua", "1 Samuel", "2 Samuel", "1 Chronicles", "Nehemiah"],
  "zillah": ["Genesis"],
  "zilpah": ["Genesis"],
  "zimmah": ["1 Chronicles"],
  "zimran": ["Genesis", "1 Chronicles"],
  "zimri": ["Numbers", "1 Kings", "1 Chronicles"],
  "zin": ["Numbers", "Joshua"],
  "zion": ["2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Psalms", "Isaiah", "Jeremiah", "Lamentations", "Joel", "Amos", "Obadiah", "Micah", "Zephaniah", "Zechariah", "Matthew", "John", "Romans", "Hebrews", "1 Peter", "Revelation"],
  "zippor": ["Numbers", "Joshua"],
  "zipporah": ["Exodus"],
  "zithri": ["Exodus"],
  "ziz": ["2 Chronicles"],
  "ziza": ["1 Chronicles", "2 Chronicles"],
  "zoan": ["Numbers", "Isaiah", "Ezekiel"],
  "zoar": ["Genesis", "Numbers", "Isaiah"],
  "zobah": ["1 Samuel", "2 Samuel", "1 Kings", "1 Chronicles", "Psalms"],
  "zohar": ["Genesis", "1 Chronicles"],
  "zoheleth": ["1 Kings"],
  "zoheth": ["1 Chronicles"],
  "zophah": ["1 Chronicles"],
  "zophai": ["1 Chronicles"],
  "zophar": ["Job"],
  "zophim": ["Numbers"],
  "zorah": ["Joshua", "Judges", "Nehemiah"],
  "zorathites": ["1 Chronicles"],
  "zoreah": ["Joshua"],
  "zur": ["Numbers", "1 Chronicles"],
  "zuriel": ["Numbers"],
  "zushim": ["Genesis"],
  "zuzim" : ["Genesis"]
};

      // Extend with places
      const PLACES_DB = {
        "babylon": ["Daniel", "2 Kings"], "bethany": ["John"], "bethel": ["Genesis"],
        "bethlehem": ["Ruth", "Matthew"], "canaan": ["Genesis", "Joshua"],
        "corinth": ["Acts"], "damascus": ["Acts"], "egypt": ["Genesis", "Exodus"],
        "ephesus": ["Acts"], "jericho": ["Joshua"],
        "jerusalem": ["2 Samuel", "Matthew", "Acts", "Lamentations", "Micah"],
        "moresheth": ["Micah"], "nazareth": ["Matthew", "Luke"],
        "nineveh": ["Jonah"], "philippi": ["Acts"], "rome": ["Acts", "Romans"],
        "sinai": ["Exodus"], "tekoa": ["Amos"], "ur": ["Genesis"],
        "zion": ["Psalms", "Lamentations", "Joel", "Micah"]
      };

      const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

      const MODES = {
        CHAIN: 'chain',
        STORM: 'storm',
        COLLECTOR: 'collector',
        ALPHABET: 'alphabet',
        TIMEATTACK: 'timeattack'
      };

      // --- Precompiled Indexes ---
      const NameIndexByFirstLetter = {};
      const NameIndexByBook = {};

      function initPrecompiledIndexes() {
        ALPHABET.forEach(l => NameIndexByFirstLetter[l.toLowerCase()] = []);
        BOOKS.forEach(b => NameIndexByBook[b] = []);
        const compile = (db) => {
          for (const entry in db) {
            const firstLetter = entry.charAt(0).toLowerCase();
            if (NameIndexByFirstLetter[firstLetter]) NameIndexByFirstLetter[firstLetter].push(entry);
            db[entry].forEach(book => { if (NameIndexByBook[book]) NameIndexByBook[book].push(entry); });
          }
        };
        compile(FALLBACK_NAMES);
        compile(PLACES_DB);
      }

      // Merge PLACES_DB into FALLBACK_NAMES for unified lookup
      function mergePlacesIntoFallback() {
        for (const [place, books] of Object.entries(PLACES_DB)) {
          if (!FALLBACK_NAMES[place]) {
            FALLBACK_NAMES[place] = books;
          }
        }
      }

      // --- Helpers ---
      function getEntryBooks(nameLower) {
        return FALLBACK_NAMES[nameLower] || null;
      }

      function getTargetMappingBook(nameLower, completedBooks) {
        const matchBooks = getEntryBooks(nameLower);
        if (!matchBooks) return null;
        for (let i = 0; i < matchBooks.length; i++) {
          if (!completedBooks.has(matchBooks[i])) return matchBooks[i];
        }
        return matchBooks[0];
      }

      function getChainTargetLetter(currentName, deadEndLetter) {
        if (deadEndLetter) return deadEndLetter;
        if (!currentName) return null;
        const nameLower = currentName.toLowerCase();
        let letter = nameLower.slice(-1);
        if (nameLower.endsWith('ah')) letter = 'a';
        return letter;
      }

      // --- Levenshtein for suggestions ---
      function levenshtein(a, b) {
        const tmp = [];
        for (let i = 0; i <= b.length; i++) tmp[i] = [i];
        for (let j = 0; j <= a.length; j++) tmp[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
          for (let j = 1; j <= a.length; j++) {
            tmp[i][j] = b[i-1] === a[j-1] ? tmp[i-1][j-1] : Math.min(tmp[i-1][j-1]+1, tmp[i][j-1]+1, tmp[i-1][j]+1);
          }
        }
        return tmp[b.length][a.length];
      }

      function findClosestMatch(input, keysArray) {
  if (!keysArray || !keysArray.length) return null;
  let closest = null, minDist = Infinity;
  const inputLower = input.toLowerCase();
  
  for (let i = 0; i < keysArray.length; i++) {
    // MUST start with same letter
    if (keysArray[i].charAt(0).toLowerCase() !== inputLower.charAt(0)) continue;
    // Skip names that are too short
    if (keysArray[i].length < 3) continue;
    const d = levenshtein(inputLower, keysArray[i]);
    if (d < minDist) { 
      minDist = d; 
      closest = keysArray[i]; 
    }
  
  // Only suggest if very close (distance = 0 or 1)
  const threshold = inputLower.length < 4 ? 1 : 1;
  return (closest && minDist <= threshold) ? { name: closest, distance: minDist } : null;
}
}

      // ============================================================
      // 3. GAME STATE
      // ============================================================
      let currentMode = MODES.CHAIN;
      let gameActive = false;
      let currentName = "";
      let usedNames = new Set();
      let usedNameList = [];
      let completedBooks = new Set();
      let bookContributionCount = {};
      let totalStrikes = 0;
      let hintsRemaining = 3;
      let streakCombo = 0;
      let comboPoints = 0;
      let skips = 3;
      let alphabetIndex = 0;
      let stormCurrentLetter = '';
      let collectorBookIndex = 0;
      let timer = 60;
      let timerInterval = null;
      let deadEndLetter = null;
      let inputDebounceTimer = null;
      let isTimeAttack = false;
      let lastBook = null;
      let sameBookCount = 0;

      // ============================================================
      // 4. DOM REFS
      // ============================================================
      const heroWord = document.getElementById('heroWord');
      const heroSub = document.getElementById('heroSub');
      const canvasInput = document.getElementById('canvasInput');
      const reqLetter = document.getElementById('reqLetter');
      const reqCount = document.getElementById('reqCount');
      const horizonScoreDisplay = document.getElementById('horizonScoreDisplay');
      const strikeDots = document.querySelectorAll('.strike-dot');
      const modalPoints = document.getElementById('modalPoints');
      const modalStreak = document.getElementById('modalStreak');
      const modalSkips = document.getElementById('modalSkips');
      const modalStrikes = document.getElementById('modalStrikes');
      const toastSystem = document.getElementById('toastSystem');
      const analyticsOverlay = document.getElementById('analyticsOverlay');
      const openPanelBtn = document.getElementById('openPanelBtn');
      const closePanelBtn = document.getElementById('closePanelBtn');
      const hintActionBtn = document.getElementById('hintActionBtn');
      const skipActionBtn = document.getElementById('skipActionBtn');
      const modesToggleBtn = document.getElementById('modesToggleBtn');
      const modesMenu = document.getElementById('modesMenu');
      const modeChips = document.querySelectorAll('.mode-chip');
      const gameOverOverlay = document.getElementById('gameOverOverlay');
      const gameOverTitle = document.getElementById('gameOverTitle');
      const gameOverSub = document.getElementById('gameOverSub');
      const goPoints = document.getElementById('goPoints');
      const goNames = document.getElementById('goNames');
      const goBooks = document.getElementById('goBooks');
      const goStreak = document.getElementById('goStreak');
      const gameOverRestartBtn = document.getElementById('gameOverRestartBtn');

      // ============================================================
      // 5. UI SYNC FUNCTIONS
      // ============================================================
      function syncUI() {
        heroWord.textContent = currentName || 'Exodus';
        heroWord.classList.remove('pop');
        if (currentName) {
          setTimeout(() => heroWord.classList.add('pop'), 10);
        }

        if (currentName) {
          const book = getTargetMappingBook(currentName.toLowerCase(), completedBooks);
          heroSub.textContent = book ? `— ${book}` : '— Complete';
        } else {
          heroSub.textContent = '—';
        }

        horizonScoreDisplay.textContent = `${completedBooks.size} / 66`;

        let reqChar = '—', countText = '0 remaining';
        if (currentMode === MODES.CHAIN && currentName) {
          reqChar = getChainTargetLetter(currentName, deadEndLetter);
          const rem = NameIndexByFirstLetter[reqChar]?.filter(n => !usedNames.has(n)).length || 0;
          countText = `${rem} remaining`;
        } else if (currentMode === MODES.STORM) {
          reqChar = stormCurrentLetter;
          const rem = NameIndexByFirstLetter[stormCurrentLetter]?.filter(n => !usedNames.has(n)).length || 0;
          countText = `${rem} remaining`;
        } else if (currentMode === MODES.COLLECTOR) {
          reqChar = '◆';
          countText = BOOKS[collectorBookIndex] || 'Complete';
        } else if (currentMode === MODES.ALPHABET) {
          reqChar = ALPHABET[alphabetIndex] || '✓';
          countText = alphabetIndex >= ALPHABET.length ? 'Complete' : `${26 - alphabetIndex} left`;
        } else if (currentMode === MODES.TIMEATTACK) {
          reqChar = '◈';
          countText = `${timer}s`;
        }
        reqLetter.textContent = typeof reqChar === 'string' ? reqChar.toUpperCase() : reqChar;
        reqCount.textContent = countText;

        strikeDots.forEach((dot, idx) => {
          dot.className = 'strike-dot';
          if (idx < totalStrikes) {
            dot.classList.add('filled');
            if (idx === totalStrikes - 1) {
              dot.classList.add('danger');
            }
          }
        });

        modalPoints.textContent = comboPoints;
        modalStreak.textContent = streakCombo;
        modalSkips.textContent = skips;
        modalStrikes.textContent = `${totalStrikes} / 3`;
      }

      function triggerToast(message, type = 'info') {
        toastSystem.textContent = message;
        toastSystem.className = 'toast-capsule';
        if (type) toastSystem.classList.add(type);
        toastSystem.classList.add('active');
        clearTimeout(toastSystem.timeoutRef);
        toastSystem.timeoutRef = setTimeout(() => {
          toastSystem.classList.remove('active');
        }, 2200);
      }

      function triggerInputError() {
        canvasInput.classList.add('invalid');
        setTimeout(() => canvasInput.classList.remove('invalid'), 400);
      }

      // ============================================================
      // 6. STRIKE & GAME OVER FUNCTIONS
      // ============================================================
      function addStrike() {
        totalStrikes++;
        syncUI();
        
        if (totalStrikes >= 3) {
          triggerToast('Game Over — 3 Strikes', 'error');
          handleGameOver('3 Strikes', false);
          return true;
        }
        triggerToast(`Strike ${totalStrikes}/3`, 'warning');
        return false;
      }

      function handleGameOver(reason, victory = false) {
        gameActive = false;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        
        gameOverTitle.textContent = victory ? 'Victory' : 'Journey Ended';
        gameOverSub.textContent = victory ? 'The path is complete.' : reason || 'The path has closed.';
        goPoints.textContent = comboPoints;
        goNames.textContent = usedNameList.length;
        goBooks.textContent = `${completedBooks.size}/66`;
        goStreak.textContent = streakCombo;
        
        gameOverOverlay.classList.add('visible');
        syncUI();
      }

      // ============================================================
      // 7. CORE GAME FUNCTIONS
      // ============================================================
      function teardownRound() {
        gameActive = false;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        usedNames.clear();
        usedNameList = [];
        completedBooks.clear();
        bookContributionCount = {};
        BOOKS.forEach(b => bookContributionCount[b] = 0);
        totalStrikes = 0;
        streakCombo = 0;
        comboPoints = 0;
        skips = 3;
        hintsRemaining = 3;
        alphabetIndex = 0;
        stormCurrentLetter = '';
        collectorBookIndex = 0;
        timer = 60;
        deadEndLetter = null;
        currentName = "";
        isTimeAttack = false;
        lastBook = null;
        sameBookCount = 0;
        gameOverOverlay.classList.remove('visible');
        syncUI();
      }

      function initGameMode(mode) {
        teardownRound();
        currentMode = mode;
        gameActive = true;

        modeChips.forEach(chip => {
          chip.classList.toggle('active', chip.dataset.mode === mode);
        });

        if (mode === MODES.CHAIN) {
          const seed = STARTER_NAMES[Math.floor(Math.random() * STARTER_NAMES.length)];
          commitEntry(seed.toLowerCase(), true);
        } else if (mode === MODES.STORM) {
          stormCurrentLetter = ALPHABET[Math.floor(Math.random() * ALPHABET.length)].toLowerCase();
          syncUI();
        } else if (mode === MODES.COLLECTOR) {
          collectorBookIndex = 0;
          syncUI();
        } else if (mode === MODES.ALPHABET) {
          alphabetIndex = 0;
          syncUI();
        } else if (mode === MODES.TIMEATTACK) {
          isTimeAttack = true;
          timer = 60;
          syncUI();
          timerInterval = setInterval(() => {
            timer--;
            syncUI();
            if (timer <= 0) {
              clearInterval(timerInterval);
              timerInterval = null;
              triggerToast('Time Expired', 'warning');
              handleGameOver('Time Expired', false);
            }
          }, 1000);
        }

        canvasInput.focus();
        triggerToast(`Mode: ${mode.toUpperCase()}`, 'success');
      }

      function commitEntry(nameLower, isInitialSeed = false) {
        const displayForm = nameLower.charAt(0).toUpperCase() + nameLower.slice(1);
        usedNames.add(nameLower);
        usedNameList.push(displayForm);
        currentName = displayForm;

        const mappedBook = getTargetMappingBook(nameLower, completedBooks);
        if (mappedBook) {
          if (lastBook === mappedBook) {
            sameBookCount++;
            if (sameBookCount >= 3) {
              triggerToast('3 same books in a row — Strike', 'warning');
              addStrike();
              sameBookCount = 0;
              lastBook = null;
            }
          } else {
            sameBookCount = 1;
            lastBook = mappedBook;
          }
          
          bookContributionCount[mappedBook] = (bookContributionCount[mappedBook] || 0) + 1;
          const limit = SHORT_BOOKS.has(mappedBook) ? 1 : 3;
          if (bookContributionCount[mappedBook] >= limit && !completedBooks.has(mappedBook)) {
            completedBooks.add(mappedBook);
            comboPoints += 5;
            skips += 1;
            triggerToast(`Book Complete: ${mappedBook}`, 'success');
          }
        } else {
          lastBook = null;
          sameBookCount = 0;
        }

        if (!isInitialSeed) {
          streakCombo++;
          comboPoints += 10 + (streakCombo > 5 ? 5 : 0);
        }

        // Mode-specific logic
        if (currentMode === MODES.CHAIN) {
          let trail = nameLower.slice(-1);
          if (nameLower.endsWith('ah')) trail = 'a';
          const poolHasOptions = NameIndexByFirstLetter[trail] &&
            NameIndexByFirstLetter[trail].some(n => !usedNames.has(n));
          if (!poolHasOptions) {
            const viable = ALPHABET
              .map(l => l.toLowerCase())
              .filter(l => NameIndexByFirstLetter[l] && NameIndexByFirstLetter[l].some(n => !usedNames.has(n)));
            deadEndLetter = viable.length ? viable[Math.floor(Math.random() * viable.length)] : null;
            if (deadEndLetter) {
              triggerToast(`"${trail.toUpperCase()}" dry — try "${deadEndLetter.toUpperCase()}"`, 'warning');
            }
          } else {
            deadEndLetter = null;
          }
        } else if (currentMode === MODES.STORM) {
          stormCurrentLetter = ALPHABET[Math.floor(Math.random() * ALPHABET.length)].toLowerCase();
        } else if (currentMode === MODES.COLLECTOR) {
          if (mappedBook === BOOKS[collectorBookIndex]) {
            completedBooks.add(BOOKS[collectorBookIndex]);
            collectorBookIndex++;
            if (collectorBookIndex >= BOOKS.length) {
              handleGameOver('All Books Gathered', true);
            }
          }
        } else if (currentMode === MODES.ALPHABET) {
          alphabetIndex++;
          if (alphabetIndex >= ALPHABET.length) {
            handleGameOver('Alphabet Complete', true);
          }
        }

        if (completedBooks.size >= BOOKS.length) {
          handleGameOver('Perfect Canon', true);
        }

        syncUI();
      }

      // ============================================================
      // 8. ENHANCED PROCESS SUBMISSION WITH API
      // ============================================================
      async function processSubmission() {
        if (!gameActive) return;

        const raw = canvasInput.value.trim().toLowerCase();
        canvasInput.value = '';
        if (!raw) return;

        // Use the enhanced lookup with API fallback
        const result = await lookupNameWithAPI(raw);

        if (!result.found) {
          // Suggest correction from local DB
          const pool = Object.keys(FALLBACK_NAMES);
          const correction = findClosestMatch(raw, pool);
          if (correction && correction.distance <= 1) {
            triggerToast(`Did you mean: ${correction.name.toUpperCase()}?`, 'warning');
            canvasInput.value = correction.name;
            return;
          }
          triggerToast('Name not found in Bible', 'error');
          triggerInputError();
          addStrike();
          return;
        }

        // If found via API, show source
        if (result.source === 'api') {
          triggerToast(`Found via Bible API`, 'api');
        }

        // Check uniqueness
        if (usedNames.has(raw)) {
          triggerToast('Already spoken', 'warning');
          triggerInputError();
          addStrike();
          return;
        }

        // Mode validation
        let pass = false;
        if (currentMode === MODES.CHAIN) {
          pass = raw.charAt(0) === getChainTargetLetter(currentName, deadEndLetter);
        } else if (currentMode === MODES.STORM) {
          pass = raw.charAt(0) === stormCurrentLetter;
        } else if (currentMode === MODES.COLLECTOR) {
          pass = result.books.includes(BOOKS[collectorBookIndex]);
        } else if (currentMode === MODES.ALPHABET) {
          pass = raw.charAt(0) === ALPHABET[alphabetIndex].toLowerCase();
        } else if (currentMode === MODES.TIMEATTACK) {
          pass = true;
        }

        if (!pass) {
          triggerToast('Letter constraint violation', 'error');
          triggerInputError();
          addStrike();
          return;
        }

        commitEntry(raw);
        triggerToast(`${raw.toUpperCase()}`, 'success');
      }

      // ============================================================
      // 9. OTHER GAME FUNCTIONS
      // ============================================================
      function executionSkip() {
        if (!gameActive) return;
        if (skips > 0) {
          skips--;
          bypassShiftState();
          triggerToast('Skip used', 'info');
          syncUI();
        } else {
          triggerToast('No skips — Strike', 'warning');
          const gameOver = addStrike();
          if (!gameOver) {
            bypassShiftState();
            syncUI();
          }
        }
      }

      function bypassShiftState() {
        streakCombo = 0;
        if (currentMode === MODES.CHAIN) {
          const target = getChainTargetLetter(currentName, deadEndLetter);
          const fallbackList = (target && NameIndexByFirstLetter[target]) || STARTER_NAMES;
          const found = fallbackList.find(n => !usedNames.has(n.toLowerCase()));
          if (found) commitEntry(found.toLowerCase(), true);
        } else if (currentMode === MODES.STORM) {
          stormCurrentLetter = ALPHABET[Math.floor(Math.random() * ALPHABET.length)].toLowerCase();
        } else if (currentMode === MODES.COLLECTOR) {
          collectorBookIndex++;
          if (collectorBookIndex >= BOOKS.length) handleGameOver('All Books Gathered', true);
        } else if (currentMode === MODES.ALPHABET) {
          alphabetIndex++;
          if (alphabetIndex >= ALPHABET.length) handleGameOver('Alphabet Complete', true);
        }
        syncUI();
      }

      function provideHint() {
        if (!gameActive || hintsRemaining <= 0) {
          triggerToast('No hints left', 'warning');
          return;
        }
        let targetPool = [];
        if (currentMode === MODES.CHAIN) {
          targetPool = NameIndexByFirstLetter[getChainTargetLetter(currentName, deadEndLetter)];
        } else if (currentMode === MODES.STORM) {
          targetPool = NameIndexByFirstLetter[stormCurrentLetter];
        } else if (currentMode === MODES.COLLECTOR) {
          targetPool = NameIndexByBook[BOOKS[collectorBookIndex]];
        } else if (currentMode === MODES.ALPHABET) {
          targetPool = NameIndexByFirstLetter[ALPHABET[alphabetIndex].toLowerCase()];
        } else if (currentMode === MODES.TIMEATTACK) {
          targetPool = Object.keys(FALLBACK_NAMES);
        }

        const match = targetPool ? targetPool.find(n => !usedNames.has(n)) : null;
        if (match) {
          hintsRemaining--;
          triggerToast(`Hint: ${match.toUpperCase()}`, 'info');
          syncUI();
        } else {
          triggerToast('No names left', 'warning');
        }
      }

      // ============================================================
      // 10. EVENT LISTENERS
      // ============================================================
      canvasInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') processSubmission();
      });

      modesToggleBtn.addEventListener('click', () => {
        modesMenu.classList.toggle('visible');
      });

      document.addEventListener('click', (e) => {
        if (!modesMenu.contains(e.target) && e.target !== modesToggleBtn) {
          modesMenu.classList.remove('visible');
        }
      });

      modeChips.forEach(chip => {
        chip.addEventListener('click', () => {
          modesMenu.classList.remove('visible');
          const mode = chip.dataset.mode;
          if (gameActive && !confirm('Switch mode? Current progress lost.')) return;
          initGameMode(mode);
        });
      });

      openPanelBtn.addEventListener('click', () => {
        syncUI();
        analyticsOverlay.classList.add('visible');
      });

      closePanelBtn.addEventListener('click', () => {
        analyticsOverlay.classList.remove('visible');
        canvasInput.focus();
      });

      hintActionBtn.addEventListener('click', provideHint);
      skipActionBtn.addEventListener('click', executionSkip);

      gameOverRestartBtn.addEventListener('click', () => {
        gameOverOverlay.classList.remove('visible');
        if (confirm('Start a new journey?')) {
          teardownRound();
          initGameMode(currentMode);
        }
      });

      // ============================================================
      // 11. INITIALIZATION
      // ============================================================
      mergePlacesIntoFallback();
      initPrecompiledIndexes();
      loadApiCache(); // Load previously cached API results
      teardownRound();
      initGameMode(MODES.CHAIN);
      canvasInput.focus();

      // Log API status
      console.log('TAW — Bible API Integration Active');
      console.log('  ─ Local entries:', Object.keys(FALLBACK_NAMES).length);
      console.log('  ─ API cache:', Object.keys(apiCache).length);
      console.log('  ─ Books indexed:', BOOKS.length);

    })();
