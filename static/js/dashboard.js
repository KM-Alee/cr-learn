// static/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  // --- COMMON DOM Elements ---
  const decksGrid = document.querySelector(".decks-grid");
  const statsTotalDecksElement = document.querySelector(".stats-grid .stat-card:nth-child(1) .stat-info p");
  const statsCardsMasteredElement = document.querySelector(".stats-grid .stat-card:nth-child(2) .stat-info p");
  const statsStudyTimeElement = document.querySelector(".stats-grid .stat-card:nth-child(3) .stat-info p");

  let activeMenuButton = null; 

  // --- Elements for Card Browser Tab ---
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  const cardSearchInput = document.getElementById("card-search-input");
  const deckFilterSelect = document.getElementById("deck-filter-select");
  const tagFilterSelect = document.getElementById("tag-filter-select");
  const applyCardFilterBtn = document.getElementById("apply-card-filter-btn");
  const clearCardFilterBtn = document.getElementById("clear-card-filter-btn"); // New
  
  const cardResultsContainer = document.getElementById("card-results-container");
  const cardResultsTable = cardResultsContainer.querySelector(".card-results-table");
  const cardResultsTbody = document.getElementById("card-results-tbody");
  
  const loadingCardsMessage = document.getElementById("loading-cards-message");
  const noCardsFoundMessage = document.getElementById("no-cards-found-message");
  const cardBrowserInitialMessage = document.getElementById("card-browser-initial-message");
  
  const createCustomDeckBtn = document.getElementById("create-custom-deck-btn");
  const selectAllCardsCheckbox = document.getElementById("select-all-cards-checkbox");

  let tagsLoadedSuccessfully = false;
  let decksLoadedSuccessfully = false;

  // --- Debounce Helper ---
  function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
  }
  const debouncedSearchUserCards = debounce(searchUserCards, 400); // 400ms delay

  // --- Helper to prevent XSS ---
  function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe === null || unsafe === undefined ? '' : String(unsafe);
    return unsafe
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "\"")
      .replace(/'/g, "'");
  }

  // --- Tab Switching Logic ---
  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      const targetTab = button.dataset.tab;

      tabButtons.forEach(btn => btn.classList.remove("active"));
      tabContents.forEach(content => content.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(`${targetTab}-content`).classList.add("active");

      if (targetTab === 'browse') {
        if (!tagsLoadedSuccessfully && tagFilterSelect) { // Check if element exists
            loadTagsForFilter();
        }
        if (!decksLoadedSuccessfully && deckFilterSelect) { // Check if element exists
            loadDecksForFilter();
        }
        if (cardResultsTbody && cardResultsTbody.children.length === 0 && 
            loadingCardsMessage && (loadingCardsMessage.style.display === 'none' || !loadingCardsMessage.style.display) &&
            cardBrowserInitialMessage) {
            cardBrowserInitialMessage.style.display = 'block';
            if (cardResultsTable) cardResultsTable.style.display = 'none';
            if (noCardsFoundMessage) noCardsFoundMessage.style.display = 'none';
        }
      } else if (targetTab === 'decks') {
        // Actions if switching back to decks tab
      }
    });
  });

  // --- "My Decks" Tab Functions (largely unchanged, ensure they still work) ---
  function createDeckCardElement(deck) {
    const deckCard = document.createElement("div");
    deckCard.className = "deck-card fade-in-up";
    deckCard.dataset.deckId = deck.id;

    const masteredPercentage = deck.mastered_percentage !== undefined ? parseFloat(deck.mastered_percentage).toFixed(0) : 0;
    const cardCount = deck.card_count || 0;
    const tagsHtml = deck.tags 
        ? deck.tags.split(',').map(tag => `<span class="tag-item">${escapeHtml(tag.trim())}</span>`).join(' ') 
        : '<span class="no-tags">No tags</span>';

    deckCard.innerHTML = `
      <div class="deck-header">
        <h3>${escapeHtml(deck.name)}</h3>
        <span class="card-count">${cardCount} card${cardCount !== 1 ? 's' : ''}</span>
        <button class="btn icon-btn deck-options-btn" data-deck-id="${deck.id}" title="More options">
            <i class="fas fa-ellipsis-v"></i>
        </button>
      </div>
      ${deck.description ? `<p class="deck-description">${escapeHtml(deck.description)}</p>` : ''}
      <div class="deck-tags-list">
        ${tagsHtml}
      </div>
      <div class="deck-progress">
        <div class="progress-bar">
          <div class="progress" style="width: ${masteredPercentage}%"></div>
        </div>
        <span class="progress-text">${masteredPercentage}% Mastered</span>
      </div>
      <div class="deck-actions">
        <button class="btn secondary-btn study-now-btn" data-deck-id="${deck.id}">
          <i class="fas fa-graduation-cap"></i> Study Now
        </button>
      </div>
    `;

    const studyButton = deckCard.querySelector(".study-now-btn");
    if (studyButton) {
      studyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        location.href = `/study?deck_id=${e.currentTarget.dataset.deckId}`;
      });
    }

    const optionsButton = deckCard.querySelector(".deck-options-btn");
    if (optionsButton) {
      optionsButton.addEventListener("click", (e) => {
        e.stopPropagation();
        closeActiveMenu();
        showDeckMenu(optionsButton, deck);
      });
    }

    deckCard.addEventListener("mouseenter", function () {
      this.style.transform = "translateY(-5px)";
      this.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.1)";
    });
    deckCard.addEventListener("mouseleave", function () {
      this.style.transform = "";
      this.style.boxShadow = "";
    });
    return deckCard;
  }

  function createDeckMenuElement(deck) {
    const menu = document.createElement('ul');
    menu.className = 'deck-context-menu';
    menu.innerHTML = `
        <li><button data-action="study"><i class="fas fa-book-open"></i> Study Deck</button></li>
        <li><button data-action="edit"><i class="fas fa-pencil-alt"></i> Edit Deck</button></li>
        <li><button data-action="delete" class="delete-option"><i class="fas fa-trash"></i> Delete Deck</button></li>
    `;
    menu.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        handleMenuAction(e.currentTarget.dataset.action, deck);
        closeActiveMenu();
      });
    });
    return menu;
  }

  function showDeckMenu(triggerButton, deck) {
    const menu = createDeckMenuElement(deck);
    triggerButton.appendChild(menu);
    triggerButton.classList.add('menu-open');
    activeMenuButton = triggerButton;
  }

  function closeActiveMenu() {
    if (activeMenuButton) {
      const menu = activeMenuButton.querySelector('.deck-context-menu');
      if (menu) menu.remove();
      activeMenuButton.classList.remove('menu-open');
      activeMenuButton = null;
    }
  }

  document.addEventListener('click', (e) => {
    if (activeMenuButton) {
      const menuElement = activeMenuButton.querySelector('.deck-context-menu');
      if (menuElement && !activeMenuButton.contains(e.target) && !menuElement.contains(e.target)) {
        closeActiveMenu();
      }
    }
  });

  function handleMenuAction(action, deck) {
    switch (action) {
      case 'study':
        location.href = `/study?deck_id=${deck.id}`;
        break;
      case 'edit':
        location.href = `/decks/${deck.id}/edit`;
        break;
      case 'delete':
        if (confirm(`Are you sure you want to delete the deck "${escapeHtml(deck.name)}"? This action cannot be undone.`)) {
          deleteDeck(deck.id, deck.name);
        }
        break;
      default:
        console.warn("Unknown menu action:", action);
    }
  }

  async function deleteDeck(deckId, deckName) {
    const deckCardElement = document.querySelector(`.deck-card[data-deck-id="${deckId}"]`);
    if (deckCardElement) deckCardElement.style.opacity = 0.5;

    try {
      const response = await fetch(`/api/decks/${deckId}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      });
      const result = await response.json();

      if (response.ok && result.success) {
        if (deckCardElement) {
          deckCardElement.classList.add('fade-out');
          deckCardElement.addEventListener('animationend', () => {
            deckCardElement.remove();
            loadDashboardStats(); 
            if (decksGrid && decksGrid.children.length === 0) { // Check if decksGrid exists
                decksGrid.innerHTML = "<p>No decks found. Create your first deck!</p>";
            }
            // Also update deck filter if it was loaded
            if (decksLoadedSuccessfully) loadDecksForFilter(); 
          }, { once: true });
        } else {
          loadDecks(); // Fallback
          if (decksLoadedSuccessfully) loadDecksForFilter();
        }
      } else {
        console.error("Error deleting deck:", result);
        alert(`Error deleting deck "${escapeHtml(deckName)}": ${result.errors?.general || result.message || 'Unknown error'}`);
        if (deckCardElement) deckCardElement.style.opacity = 1;
      }
    } catch (error) {
      console.error("Failed to delete deck:", error);
      alert(`An unexpected error occurred while deleting deck "${escapeHtml(deckName)}".`);
      if (deckCardElement) deckCardElement.style.opacity = 1;
    }
  }

  async function loadDecks() {
    if (!decksGrid) return; 
    decksGrid.innerHTML = "<p>Loading decks...</p>";
    try {
      const response = await fetch("/api/decks");
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/auth?tab=login&next=' + encodeURIComponent(window.location.pathname);
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();

      if (result.success && result.decks) {
        decksGrid.innerHTML = "";
        if (result.decks.length === 0) {
          decksGrid.innerHTML = "<p>No decks found. Create your first deck!</p>";
        } else {
          result.decks.forEach((deck, index) => {
            const deckCardElement = createDeckCardElement(deck);
            deckCardElement.style.animationDelay = `${index * 0.05}s`;
            decksGrid.appendChild(deckCardElement);
          });
        }
      } else {
        decksGrid.innerHTML = `<p>Error loading decks: ${escapeHtml(result.errors?.general) || 'Unknown error'}</p>`;
      }
    } catch (error) {
      console.error("Failed to load decks:", error);
      decksGrid.innerHTML = "<p>Could not load decks. Please try again later.</p>";
    }
  }

  async function loadDashboardStats() {
    if (statsTotalDecksElement) statsTotalDecksElement.textContent = '...';
    if (statsCardsMasteredElement) statsCardsMasteredElement.textContent = '...';
    if (statsStudyTimeElement) statsStudyTimeElement.textContent = '...';

    try {
      const response = await fetch("/api/stats/dashboard");
      if (!response.ok) {
        console.error("Failed to fetch dashboard stats", response.status);
        if (statsTotalDecksElement) statsTotalDecksElement.textContent = 'N/A';
        if (statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'N/A';
        if (statsStudyTimeElement) statsStudyTimeElement.textContent = 'N/A';
        return;
      }
      const result = await response.json();
      if (result.success && result.stats) {
        const stats = result.stats;
        if (statsTotalDecksElement) statsTotalDecksElement.textContent = stats.total_decks !== undefined ? stats.total_decks : 'N/A';
        if (statsCardsMasteredElement) statsCardsMasteredElement.textContent = stats.cards_mastered !== undefined ? stats.cards_mastered : 'N/A';
        if (statsStudyTimeElement) statsStudyTimeElement.textContent = stats.total_study_time_formatted || 'N/A';
      } else {
        console.error("API returned error for dashboard stats:", result);
        if (statsTotalDecksElement) statsTotalDecksElement.textContent = 'Error';
        if (statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'Error';
        if (statsStudyTimeElement) statsStudyTimeElement.textContent = 'Error';
      }
    } catch (error) {
      console.error("Error during loadDashboardStats:", error);
      if (statsTotalDecksElement) statsTotalDecksElement.textContent = 'Error';
      if (statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'Error';
      if (statsStudyTimeElement) statsStudyTimeElement.textContent = 'Error';
    }
  }

  // --- Card Browser Tab Functions ---

  async function loadTagsForFilter() {
    if (!tagFilterSelect) return;
    console.log("Attempting to load tags for filter...");
    let currentOption = tagFilterSelect.querySelector('option[disabled]');
    if (!currentOption) {
        tagFilterSelect.innerHTML = '<option value="" disabled selected>Loading tags...</option>';
    } else {
        currentOption.textContent = 'Loading tags...';
        currentOption.selected = true;
    }
    
    try {
        const response = await fetch("/api/tags");
        if (!response.ok) {
            console.error("Failed to fetch tags:", response.status);
            tagFilterSelect.innerHTML = '<option value="" disabled selected>Error loading tags</option>';
            tagsLoadedSuccessfully = false;
            return;
        }
        const result = await response.json();
        tagFilterSelect.innerHTML = ''; // Clear loading/error message

        if (result.success && result.tags) {
            if (result.tags.length === 0) {
                const noTagsOption = document.createElement('option');
                noTagsOption.textContent = "No tags available";
                noTagsOption.disabled = true; // User cannot select this
                tagFilterSelect.appendChild(noTagsOption);
            } else {
                result.tags.forEach(tag => {
                    const option = document.createElement('option');
                    option.value = tag.id;
                    option.textContent = escapeHtml(tag.name);
                    tagFilterSelect.appendChild(option);
                });
            }
            console.log("Tags loaded and populated into select:", result.tags.length);
            tagsLoadedSuccessfully = true;
        } else {
            console.error("API error fetching tags:", result.errors);
            tagFilterSelect.innerHTML = '<option value="" disabled selected>Error: No tags found or API issue</option>';
            tagsLoadedSuccessfully = false;
        }
    } catch (error) {
        console.error("Error in loadTagsForFilter:", error);
        tagFilterSelect.innerHTML = '<option value="" disabled selected>Error contacting server for tags</option>';
        tagsLoadedSuccessfully = false;
    }
  }

  async function loadDecksForFilter() {
    if (!deckFilterSelect) return;
    console.log("Attempting to load decks for filter...");
    const defaultAllDecksOption = '<option value="">All Decks</option>';
    let currentLoadingOption = deckFilterSelect.querySelector('option[disabled]');
    if (!currentLoadingOption) {
        deckFilterSelect.innerHTML = '<option value="" disabled selected>Loading decks...</option>';
    } else {
        currentLoadingOption.textContent = 'Loading decks...';
        currentLoadingOption.selected = true;
    }

    try {
        const response = await fetch("/api/decks");
        if (!response.ok) {
            console.error("Failed to fetch decks for filter:", response.status);
            deckFilterSelect.innerHTML = defaultAllDecksOption + '<option value="" disabled>Error loading decks</option>';
            deckFilterSelect.value = ""; // Select "All Decks"
            decksLoadedSuccessfully = false;
            return;
        }
        const result = await response.json();
        deckFilterSelect.innerHTML = defaultAllDecksOption; 

        if (result.success && result.decks) {
            if (result.decks.length > 0) {
                result.decks.forEach(deck => {
                    const option = document.createElement('option');
                    option.value = deck.id;
                    option.textContent = escapeHtml(deck.name);
                    deckFilterSelect.appendChild(option);
                });
            } else {
                 // No additional message needed if "All Decks" is the only one, it implies no specific decks.
            }
            console.log("Decks loaded for filter:", result.decks.length);
            decksLoadedSuccessfully = true;
        } else {
            console.error("API error fetching decks for filter:", result.errors);
            // "All Decks" is already there. Could add a disabled error option if desired.
            // e.g., deckFilterSelect.innerHTML += '<option value="" disabled>API error fetching decks</option>';
            decksLoadedSuccessfully = false;
        }
        deckFilterSelect.value = ""; // Ensure "All Decks" is selected by default after loading
    } catch (error) {
        console.error("Error in loadDecksForFilter:", error);
        deckFilterSelect.innerHTML = defaultAllDecksOption + '<option value="" disabled>Server error for decks</option>';
        deckFilterSelect.value = "";
        decksLoadedSuccessfully = false;
    }
  }

  function updateCreateCustomDeckButtonState() {
    if (!createCustomDeckBtn) return;
    const selectedCheckboxes = cardResultsTbody.querySelectorAll('input[type="checkbox"]:checked');
    createCustomDeckBtn.disabled = selectedCheckboxes.length === 0;
  }

  function renderCardResults(cards) {
    if (!cardResultsTbody || !cardBrowserInitialMessage || !loadingCardsMessage || !noCardsFoundMessage || !cardResultsTable) {
        console.error("One or more card browser display elements are missing.");
        return;
    }
    console.log("Rendering card results. Received cards count:", cards ? cards.length : 0);

    cardResultsTbody.innerHTML = ''; 
    cardBrowserInitialMessage.style.display = 'none';
    loadingCardsMessage.style.display = 'none';

    if (!cards || cards.length === 0) {
        noCardsFoundMessage.style.display = 'block';
        cardResultsTable.style.display = 'none';
        if(selectAllCardsCheckbox) {
            selectAllCardsCheckbox.checked = false;
            selectAllCardsCheckbox.disabled = true;
        }
        updateCreateCustomDeckButtonState();
        return;
    }

    noCardsFoundMessage.style.display = 'none';
    cardResultsTable.style.display = 'table';
    if(selectAllCardsCheckbox) selectAllCardsCheckbox.disabled = false;

    cards.forEach(card => {
        const row = cardResultsTbody.insertRow();
        row.dataset.noteId = card.note_id; 
        row.dataset.flashcardId = card.flashcard_id;

        const tagsArray = card.tags ? card.tags.split(',').map(t => t.trim()).filter(t => t) : [];
        const tagsHtml = tagsArray.length > 0 ? tagsArray.map(tag => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join(' ') : '<i>No tags</i>';

        row.innerHTML = `
            <td><input type="checkbox" class="card-select-checkbox" data-note-id="${card.note_id}"></td>
            <td class="card-content-cell" title="${escapeHtml(card.front)}">${escapeHtml(card.front)}</td>
            <td class="card-content-cell" title="${escapeHtml(card.back)}">${escapeHtml(card.back)}</td>
            <td>${escapeHtml(card.deck_name)}</td>
            <td>${tagsHtml}</td>
        `;
        const checkbox = row.querySelector('.card-select-checkbox');
        if (checkbox) {
            checkbox.addEventListener('change', () => {
                updateCreateCustomDeckButtonState();
                if (selectAllCardsCheckbox) {
                    const allCardCheckboxes = cardResultsTbody.querySelectorAll('.card-select-checkbox');
                    const allChecked = Array.from(allCardCheckboxes).every(cb => cb.checked);
                    selectAllCardsCheckbox.checked = allChecked && allCardCheckboxes.length > 0;
                }
            });
        }
    });
    updateCreateCustomDeckButtonState(); 
  }

  async function searchUserCards() {
    // Ensure all DOM elements are present before proceeding
    if (!cardSearchInput || !tagFilterSelect || !deckFilterSelect || 
        !cardResultsTable || !noCardsFoundMessage || !cardBrowserInitialMessage || 
        !loadingCardsMessage || !cardResultsTbody) {
        console.error("Card browser search cannot proceed: Critical DOM elements missing.");
        return;
    }

    const query = cardSearchInput.value.trim();
    const selectedTagOptions = Array.from(tagFilterSelect.selectedOptions);
    const tagIds = selectedTagOptions.map(option => option.value).filter(value => value !== "").join(',');
    const selectedDeckId = deckFilterSelect.value;

    console.log(`Performing card search: Query='${query}', Tags='${tagIds}', DeckID='${selectedDeckId}'`);

    // Set UI to loading state
    loadingCardsMessage.style.display = 'block';
    cardResultsTable.style.display = 'none';
    noCardsFoundMessage.style.display = 'none';
    cardBrowserInitialMessage.style.display = 'none';
    
    if(createCustomDeckBtn) createCustomDeckBtn.disabled = true;
    if(selectAllCardsCheckbox) {
        selectAllCardsCheckbox.checked = false;
        selectAllCardsCheckbox.disabled = true; // Will be re-enabled if results are found
    }

    try {
        const apiUrl = `/api/cards/search?query=${encodeURIComponent(query)}&tags=${encodeURIComponent(tagIds)}&deck_id=${encodeURIComponent(selectedDeckId)}`;
        const response = await fetch(apiUrl);
        
        let result;
        try {
            result = await response.json();
            console.log("Card search API response JSON:", result);
        } catch (jsonError) {
             console.error("Failed to parse card search API JSON response:", jsonError);
             const textResponse = await response.text(); // await here
             console.error("Card search API response text:", textResponse);
             throw new Error(`API returned non-JSON response (Status: ${response.status}). Body: ${textResponse}`);
        }

        if (response.ok && result.success) {
            console.log(`Card search successful. Found ${result.cards ? result.cards.length : 0} cards.`);
            renderCardResults(result.cards);
        } else {
            let errorMessage = result.errors?.general || result.message || 'Unknown error from API';
            console.error("Card search API returned error:", errorMessage, result);
            noCardsFoundMessage.textContent = `Error searching cards: ${escapeHtml(errorMessage)}`;
            noCardsFoundMessage.style.display = 'block';
            // cardResultsTable, cardBrowserInitialMessage already hidden
        }
    } catch (error) {
        console.error("Failed to search cards (network/fetch error):", error);
        noCardsFoundMessage.textContent = `An unexpected error occurred: ${error.message || String(error)}`;
        noCardsFoundMessage.style.display = 'block';
        // cardResultsTable, cardBrowserInitialMessage already hidden
    } finally {
         if(loadingCardsMessage) loadingCardsMessage.style.display = 'none';
         updateCreateCustomDeckButtonState(); 
         // selectAllCardsCheckbox enabled/disabled state is handled by renderCardResults
    }
  }
  
  // Event Listeners for Card Browser
  if (applyCardFilterBtn) {
    applyCardFilterBtn.addEventListener('click', searchUserCards); // Immediate search on button click
  }

  if (cardSearchInput) {
    cardSearchInput.addEventListener('input', debouncedSearchUserCards); // Debounced search on typing
    cardSearchInput.addEventListener('keypress', (e) => { // Immediate search on Enter
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission if it's in a form
            searchUserCards();
        }
    });
  }
  // Optional: Trigger search when deck or tag filters change.
  // This can be noisy, so often users prefer an explicit "Apply" button.
  // If you want this:
  // if (deckFilterSelect) {
  //   deckFilterSelect.addEventListener('change', searchUserCards);
  // }
  // if (tagFilterSelect) {
  //   tagFilterSelect.addEventListener('change', searchUserCards);
  // }

  if (clearCardFilterBtn) {
    clearCardFilterBtn.addEventListener('click', () => {
        if (cardSearchInput) cardSearchInput.value = '';
        if (deckFilterSelect) deckFilterSelect.value = ''; // Resets to "All Decks"
        if (tagFilterSelect) {
            Array.from(tagFilterSelect.options).forEach(option => option.selected = false);
            // If using a library for multi-select, you might need its specific API to clear.
        }
        // Optionally, trigger a search to show all cards or reset to initial message
        // searchUserCards(); // This would show all cards (or based on empty filters)
        // OR reset to initial view:
        if(cardResultsTbody) cardResultsTbody.innerHTML = '';
        if(cardResultsTable) cardResultsTable.style.display = 'none';
        if(noCardsFoundMessage) noCardsFoundMessage.style.display = 'none';
        if(cardBrowserInitialMessage) cardBrowserInitialMessage.style.display = 'block';
        if(selectAllCardsCheckbox) {
            selectAllCardsCheckbox.checked = false;
            selectAllCardsCheckbox.disabled = true;
        }
        updateCreateCustomDeckButtonState();
        console.log("Card browser filters cleared.");
    });
  }

  if (selectAllCardsCheckbox) {
    selectAllCardsCheckbox.addEventListener('change', () => {
        if (!cardResultsTbody) return;
        const checkboxes = cardResultsTbody.querySelectorAll('.card-select-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAllCardsCheckbox.checked;
        });
        updateCreateCustomDeckButtonState();
    });
  }

  if (createCustomDeckBtn) {
    createCustomDeckBtn.addEventListener('click', async () => {
        if (!cardResultsTbody) return;
        const selectedCheckboxes = cardResultsTbody.querySelectorAll('input.card-select-checkbox:checked');
        if (selectedCheckboxes.length === 0) {
            alert("Please select at least one card to create a deck.");
            return;
        }

        const noteIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.noteId));
        
        const defaultDeckName = "Custom Study " + new Date().toLocaleDateString().replace(/\//g, '-');
        const deckName = prompt("Enter a name for your new custom deck:", defaultDeckName);
        
        if (!deckName || deckName.trim() === "") {
            if (deckName !== null) { 
                 alert("Deck name cannot be empty.");
            }
            return; 
        }

        createCustomDeckBtn.disabled = true;
        createCustomDeckBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

        try {
            const response = await fetch('/api/decks/create-custom', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ name: deckName.trim(), note_ids: noteIds })
            });
            const result = await response.json();

            if (response.ok && result.success) {
                alert(`Deck "${escapeHtml(result.deck.name)}" created successfully with ${result.deck.card_count || 0} cards!`);
                
                loadDecks(); 
                loadDashboardStats();
                if (decksLoadedSuccessfully) loadDecksForFilter(); // Refresh deck filter list

                const decksTabButton = document.querySelector('.tab-button[data-tab="decks"]');
                if (decksTabButton) {
                    decksTabButton.click();
                }

                cardResultsTbody.querySelectorAll('input.card-select-checkbox:checked').forEach(cb => cb.checked = false);
                if(selectAllCardsCheckbox) selectAllCardsCheckbox.checked = false;
                updateCreateCustomDeckButtonState();

            } else {
                let errorMessage = "Unknown error occurred.";
                if (result.errors) {
                    if (result.errors.general) errorMessage = result.errors.general;
                    else if (result.errors.name) errorMessage = `Name error: ${result.errors.name}`;
                    else if (result.errors.note_ids) errorMessage = `Card selection error: ${result.errors.note_ids}`;
                    else errorMessage = JSON.stringify(result.errors);
                } else if (result.message) {
                    errorMessage = result.message;
                } else if (!response.ok) {
                    errorMessage = `Server error: ${response.status} ${response.statusText}`;
                }
                console.error("Error creating custom deck:", result);
                alert(`Error creating deck: ${escapeHtml(errorMessage)}`);
            }
        } catch (error) {
            console.error("Error creating custom deck (fetch exception):", error);
            alert("An unexpected network error occurred while creating the deck. Please check your connection and try again.");
        } finally {
            createCustomDeckBtn.disabled = false;
            createCustomDeckBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Create Deck from Selected';
        }
    });
  }
  
  // --- Initial Load Logic ---
  const initialActiveTabButton = document.querySelector(".tab-button.active") || document.querySelector('.tab-button[data-tab="decks"]');
  if (initialActiveTabButton) {
      // Ensure correct tab content is displayed based on initial active button
      const initialTargetTab = initialActiveTabButton.dataset.tab;
      tabButtons.forEach(btn => btn.classList.remove("active"));
      tabContents.forEach(content => content.classList.remove("active"));
      initialActiveTabButton.classList.add("active");
      const initialActiveContent = document.getElementById(`${initialTargetTab}-content`);
      if (initialActiveContent) {
        initialActiveContent.classList.add("active");
      }

      // Now trigger specific loading logic based on the active tab
      if (initialTargetTab === 'browse') {
        if (!tagsLoadedSuccessfully && tagFilterSelect) loadTagsForFilter();
        if (!decksLoadedSuccessfully && deckFilterSelect) loadDecksForFilter();
        if (cardResultsTbody && cardResultsTbody.children.length === 0 && 
            loadingCardsMessage && (loadingCardsMessage.style.display === 'none' || !loadingCardsMessage.style.display) &&
            cardBrowserInitialMessage) {
            cardBrowserInitialMessage.style.display = 'block';
        }
      } else if (initialTargetTab === 'decks') {
        loadDecks();
        loadDashboardStats();
      }
  } else { // Fallback if no tab is marked active
      if (document.getElementById('decks-content')) { // Default to decks tab
          loadDecks();
          loadDashboardStats();
          const defaultDeckTabBtn = document.querySelector('.tab-button[data-tab="decks"]');
          const defaultDeckContent = document.getElementById('decks-content');
          if(defaultDeckTabBtn) defaultDeckTabBtn.classList.add('active');
          if(defaultDeckContent) defaultDeckContent.classList.add('active');
      }
  }
  closeActiveMenu();
});