(() => {
  const SELECTORS = {
    form: '#wf-form-plot-updates',
    nameSelect: '#name',
    availabilitySelect: '#availability',
    priceInput: '#price',
    sharePriceInput: '#share-price',
    rentInput: '#rent',
    serviceChargeInput: '#service-charge',
    statusSelect: '#status',
    plotNumberHidden: 'input[name="plot_number"]',
    dataEmbeds: '[plot-data]'
  };

  let plotData = {};

  const init = () => {
    const form = document.querySelector(SELECTORS.form);
    const nameSelect = document.querySelector(SELECTORS.nameSelect);
    const priceInput = document.querySelector(SELECTORS.priceInput);
    const sharePriceInput = document.querySelector(SELECTORS.sharePriceInput);
    const rentInput = document.querySelector(SELECTORS.rentInput);
    const serviceChargeInput = document.querySelector(SELECTORS.serviceChargeInput);

    if (!form || !nameSelect || !priceInput) return;

    // 1. Parse data from CMS embeds
    parseCMSData();

    // 2. Populate the "Select Plot" dropdown
    populateDropdown(nameSelect);

    // 3. Change price input to text to allow visual formatting (symbols/commas)
    priceInput.type = 'text';
    if (sharePriceInput) sharePriceInput.type = 'text';
    if (rentInput) rentInput.type = 'text';
    if (serviceChargeInput) serviceChargeInput.type = 'text';

    // 4. Event Listeners
    nameSelect.addEventListener('change', (e) => handlePlotSelection(e.target.value));
    
    priceInput.addEventListener('input', (e) => {
      const rawValue = e.target.value.replace(/\D/g, '');
      e.target.value = formatCurrency(rawValue);
    });

    if (sharePriceInput) {
      sharePriceInput.addEventListener('input', (e) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        e.target.value = formatCurrency(rawValue);
      });
    }

    if (rentInput) {
      rentInput.addEventListener('input', (e) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        e.target.value = formatCurrency(rawValue);
      });
    }

    if (serviceChargeInput) {
      serviceChargeInput.addEventListener('input', (e) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        e.target.value = formatCurrency(rawValue);
      });
    }

    // Clean price data before submission
    form.addEventListener('submit', () => {
      const rawValue = priceInput.value.replace(/\D/g, '');
      priceInput.value = rawValue; // Set to pure number for the POST request

      if (sharePriceInput) sharePriceInput.value = sharePriceInput.value.replace(/\D/g, '');
      if (rentInput) rentInput.value = rentInput.value.replace(/\D/g, '');
      if (serviceChargeInput) serviceChargeInput.value = serviceChargeInput.value.replace(/\D/g, '');
    });
  };

  const parseCMSData = () => {
    document.querySelectorAll(SELECTORS.dataEmbeds).forEach(embed => {
      try {
        let text = embed.textContent.trim();
        
        // 1. Fix unquoted keys if they exist (e.g. name: -> "name":)
        text = text.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

        // 2. Fix unquoted availability values (e.g. "availability": Unavailable)
        text = text.replace(/"availability":\s*(?!null|true|false|"|')([A-Za-z]+)/g, '"availability": "$1"');

        // 3. Fix missing values (e.g. "price": ,)
        text = text.replace(/:\s*([,}\]])/g, ': null$1');

        // 4. Remove trailing commas before closing braces/brackets
        text = text.replace(/,\s*([}\]])/g, '$1');

        const parsed = JSON.parse(text);
        const items = Array.isArray(parsed) ? parsed : [parsed];

        items.forEach(item => {
          if (item && item.name) {
            plotData[item.name] = item;
          }
        });
      } catch (err) {
        console.error("Error parsing plot data embed:", err);
      }
    });
  };

  const populateDropdown = (selectEl) => {
    // Clear existing options except the placeholder ("-")
    const placeholder = selectEl.querySelector('option[value=""]');
    selectEl.innerHTML = '';
    if (placeholder) selectEl.appendChild(placeholder);

    const names = Object.keys(plotData);
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      selectEl.appendChild(opt);
    });
  };

  const handlePlotSelection = (selectedName) => {
    const availabilitySelect = document.querySelector(SELECTORS.availabilitySelect);
    const priceInput = document.querySelector(SELECTORS.priceInput);
    const sharePriceInput = document.querySelector(SELECTORS.sharePriceInput);
    const rentInput = document.querySelector(SELECTORS.rentInput);
    const serviceChargeInput = document.querySelector(SELECTORS.serviceChargeInput);
    const statusSelect = document.querySelector(SELECTORS.statusSelect);
    const plotNumberHidden = document.querySelector(SELECTORS.plotNumberHidden);
    
    const data = plotData[selectedName];

    if (data) {
      if (availabilitySelect) availabilitySelect.value = data.availability || "";
      if (priceInput) priceInput.value = formatCurrency(data.price);
      if (sharePriceInput) sharePriceInput.value = formatCurrency(data["share-price"]);
      if (rentInput) rentInput.value = formatCurrency(data.rent);
      if (serviceChargeInput) serviceChargeInput.value = formatCurrency(data["service-charge"]);
      if (statusSelect) statusSelect.value = data.status || statusSelect.options[0]?.value || "";
      if (plotNumberHidden) plotNumberHidden.value = data.plot_number || "";
    } else {
      if (availabilitySelect) availabilitySelect.value = "";
      if (priceInput) priceInput.value = "";
      if (sharePriceInput) sharePriceInput.value = "";
      if (rentInput) rentInput.value = "";
      if (serviceChargeInput) serviceChargeInput.value = "";
      if (statusSelect) statusSelect.selectedIndex = 0;
      if (plotNumberHidden) plotNumberHidden.value = "";
    }
  };

  const formatCurrency = (val) => {
    if (val === null || val === undefined || val === '') return '';
    
    // Ensure we are working with a string of digits
    const numString = String(val).replace(/\D/g, '');
    if (!numString) return '';

    const n = parseInt(numString, 10);
    return '£' + n.toLocaleString('en-GB');
  };

  const normalizeNumber = (val) => {
    if (val === null || val === undefined || val === '') return '';

    return String(val).replace(/[^\d.-]/g, '');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();