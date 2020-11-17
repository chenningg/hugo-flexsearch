import FlexSearch from "flexsearch";

export default class HugoFlexSearch {
  constructor(args) {
    this.config = {
      indexUrl: "/index.json",
      version: "v1",
      mode: "development",
      loadOn: "focus",
      searchOn: "keyup",
      inputClass: "search-bar",
      outputClass: "search-results",
      rtl: false,
      encode: "simple",
      tokenize: "forward",
      threshold: 0,
      resolution: 4,
      depth: 0,
      cache: 1800,
      indexedFields: [
        "title",
        "description",
        "tags",
        "categories",
        "content",
        "url",
      ],
      limit: 10,
      suggestions: true,
      searchLogic: "or",
      indexOptions: {},
      searchOptions: {},
      resultTemplate: (post) => {
        let result = `<div class="mb-4 w-full"><a href="${post.url}">`;
        if (post.title) {
          result += `<h4>${post.title}</h4>`;
        }
        if (post.description) {
          result += `<p class="text-base">${post.description}</p>`;
        }
        result += `</a></div><hr class="mb-4 block w-full" />`;
        return result;
      },
      emptyTemplate: () => {
        let result = `<div><p>No results found.</p></div>`;
        return result;
      },
      customProcessing: (post) => {
        if (post.tags) {
          post.strTags = post.tags.join(" ").toLowerCase();
        }
        if (post.categories) {
          post.strCategories = post.categories.join(" ").toLowerCase();
        }

        return post;
      },
    };

    // Use as ID for indexing
    this.postCount = 0;
    this.dataLoaded = false;
    this.cache = this.initCache();

    // Initialize config file based on user's config inputs.
    this.initConfig(args);
  }

  initConfig(args) {
    if (args) {
      for (let [key, value] of Object.entries(args)) {
        this.config[key] = value;
      }
    }

    // Set mode this was run in
    this.isDev = this.config.mode === "development";

    // Initialize index options
    this.config.indexOptions = {
      rtl: this.config.rtl,
      encode: this.config.encode,
      tokenize: this.config.tokenize,
      threshold: this.config.threshold,
      resolution: this.config.resolution,
      depth: this.config.depth,
      doc: {
        id: "id",
        field: this.config.indexedFields,
      },
    };

    // Initialize search options
    this.config.searchOptions = {
      limit: this.config.limit,
      suggest: this.config.suggestions,
      bool: this.config.searchLogic,
      page: false,
    };

    // Initialize input element
    let searchInputs = document.getElementsByClassName(this.config.inputClass);
    this.searchInputs = searchInputs;
    if (searchInputs) {
      // Add listeners to input
      this.addSearchListeners(searchInputs);

      // Trigger data loading listeners
      this.triggerDataLoad(searchInputs);
    } else {
      this.log(
        `Unable to find the input element(s), please check your configuration for inputClass.`
      );
    }

    // Initialize output element
    let searchOutputs = document.getElementsByClassName(
      this.config.outputClass
    );
    this.searchOutputs = searchOutputs;

    if (searchOutputs) {
    } else {
      this.log(
        `Unable to find the output element, please check your configuration for outputClass.`
      );
    }

    // Create blank index
    this.index = this.createIndex();
  }

  // Function to add listeners on when to begin search function
  addSearchListeners(searchInputs) {
    // Prevent input form (if any) from being submitted on search.
    for (let element of searchInputs) {
      let searchForm = element.closest("form");
      if (searchForm) {
        searchForm.addEventListener("submit", (e) => {
          e.preventDefault();
        });
      }

      // Check configuration on when to search
      switch (this.config.searchOn) {
        case "keyup":
          element.addEventListener("keyup", () => {
            let query = element.value.toLowerCase();
            this.search(query);
          });
          break;
        case "submit":
          element.addEventListener("submit", () => {
            let query = element.value.toLowerCase();
            this.search(query);
          });
          break;
        default:
          this.log(`Unknown "searchOn" option: '${this.config.searchOn}'`);
          return;
      }
    }
  }

  // Function to trigger when to load index for search
  triggerDataLoad(searchInputs) {
    for (let element of searchInputs) {
      switch (this.config.loadOn) {
        case "focus":
          element.addEventListener("focus", () => {
            this.loadData();
          });
          break;
        case "load":
          window.addEventListener("load", () => {
            this.loadData();
          });
          break;
        default:
          this.log(`Unknown "loadOn" option: '${this.config.loadOn}'`);
          return;
      }
    }
  }

  // Create new index
  createIndex() {
    return new FlexSearch(this.config.indexOptions);
  }

  // Get latest data from index.json
  fetchData() {
    fetch(this.config.indexUrl)
      .then((res) => res.json())
      .then((data) => {
        // Populate index with new data
        this.index = this.createIndex();

        const currData = data.slice(0, data.length - 1);
        const currHash = data[data.length - 1].hash;

        currData.forEach((post) => {
          let formattedPost = this.format(post);
          if (formattedPost) {
            this.index.add(formattedPost);
          }
        });

        this.dataLoaded = true;

        if (this.cache) {
          this.setCache("HugoSearch.index", this.index.export());
          this.setCache("HugoSearch.hash", currHash);
        }

        this.log("Index created successfully from latest data.");
      })
      .catch((err) => {
        this.log(err);
      });
  }

  format(post) {
    // Use numeric ID for indexing to save memory
    post.id = this.postCount++;

    post = this.config.customProcessing(post);

    return post;
  }

  loadData() {
    if (this.dataLoaded) return;

    // If no cache, just fetch new data.
    if (!this.cache) {
      this.log(
        "No localStorage found, caching is disabled. Fetching new data..."
      );
      this.fetchData();
      return;
    }

    let cachedIndex = this.getCache("HugoSearch.index");
    if (cachedIndex) {
      this.log("Found an index stored in cache, loading it...");

      this.index.import(cachedIndex);
      this.dataLoaded = true;

      this.validateCache();
    } else {
      this.log("No already stored index found. Fetching new data...");
      this.fetchData();
    }
  }

  validateCache() {
    // Check if cached hash exists.
    let cachedHash = this.getCache("HugoSearch.hash");
    this.log("Checking if cache is up to date...");

    if (!cachedHash) {
      this.log("No cached hash found, purging the cache...");
      this.fetchData();
      return;
    }

    // If cached hash exists, compare hashes to see if anything changed.
    fetch(this.config.indexUrl)
      .then((res) => res.json())
      .then((data) => {
        let currHash = data[data.length - 1].hash;

        if (cachedHash !== currHash) {
          this.log("Local cache is outdated, purging cache...");
          this.fetchData();
        } else {
          this.log("Local cache is up to date. Reading from cache...");
        }
      })
      .catch((err) => {
        this.log(err);
      });
  }

  search(query) {
    this.loadData();
    let results = this.index.search(query, this.config.searchOptions);
    this.display(results);
  }

  display(results) {
    let innerHTML = "";

    try {
      if (results.length > 0) {
        results.forEach((result, index) => {
          result.index = index;
          innerHTML += this.config.resultTemplate(result);
        });
      } else {
        innerHTML = this.config.emptyTemplate();
      }

      for (let element of this.searchOutputs) {
        element.innerHTML = innerHTML;
      }
    } catch (error) {
      this.log(error);
    }
  }

  // ================= MISC FUNCTIONS ================== //

  initCache() {
    // Check if localStorage is supported by browser
    if (typeof Storage === "undefined") {
      this.log("No localStorage found, no caching available.");
      return undefined;
    }

    return localStorage;
  }

  getCache(key) {
    return localStorage.getItem(key);
  }

  setCache(key, value) {
    localStorage.setItem(key, value);
  }

  // Outputs logging only if in development mode (debug true)
  log(str) {
    if (this.isDev) {
      console.log(str);
    }
  }
}
