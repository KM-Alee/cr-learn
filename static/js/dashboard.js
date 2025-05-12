// static/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const decksGrid = document.querySelector(".decks-grid");
  const statsTotalDecksElement = document.querySelector(".stats-grid .stat-card:nth-child(1) .stat-info p");
  const statsCardsMasteredElement = document.querySelector(".stats-grid .stat-card:nth-child(2) .stat-info p");
  const statsStudyTimeElement = document.querySelector(".stats-grid .stat-card:nth-child(3) .stat-info p");

  let activeMenuButton = null; // To keep track of the button that opened the menu

      function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&")
             .replace(/</g, "<")
             .replace(/>/g, ">")
             .replace(/"/g, "\"")
             .replace(/'/g, "'");
     }

  function createDeckCardElement(deck) {
    const deckCard = document.createElement("div");
    deckCard.className = "deck-card fade-in-up";
    deckCard.dataset.deckId = deck.id;

    const masteredPercentage = deck.mastered_percentage !== undefined ? deck.mastered_percentage.toFixed(0) : 0;
    const cardCount = deck.card_count || 0;
    const tagsHtml = deck.tags ? deck.tags.split(',').map(tag => `<span class="tag-item">${escapeHtml(tag.trim())}</span>`).join(' ') : 'No tags';

    deckCard.innerHTML = `
      <div class="deck-header">
        <h3>${escapeHtml(deck.name)}</h3>
        <span class="card-count">${cardCount} card${cardCount !== 1 ? 's' : ''}</span>
         <button class="btn icon-btn deck-options-btn" data-deck-id="${deck.id}" title="More options">
            <i class="fas fa-ellipsis-v"></i>
        </button>
      </div>
      ${deck.description ? `<p style="font-size: 0.9em; color: #555; margin-bottom: 10px;">${escapeHtml(deck.description)}</p>` : ''}
      <div class="deck-tags-list" style="font-size: 0.8em; color: #777; margin-bottom: 10px;">
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
          Study Now
        </button>
      </div>
    `;

     const studyButton = deckCard.querySelector(".study-now-btn");
     if(studyButton) {
         studyButton.addEventListener('click', (e) => {
             e.stopPropagation();
             location.href = `/study?deck_id=${e.currentTarget.dataset.deckId}`;
         });
     }

    const optionsButton = deckCard.querySelector(".deck-options-btn");
    if (optionsButton) {
      optionsButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent click from bubbling up to document
        
        // If this menu is already open, close it
        if (activeMenuButton === optionsButton) {
            closeActiveMenu();
        } else {
            // Close any other open menu
            closeActiveMenu();
            // Show the menu for this button
            showDeckMenu(optionsButton, deck);
        }
      });
    }

    // Add hover effect
    deckCard.addEventListener("mouseenter", function () {
      this.style.transform = "translateY(-5px)";
      this.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.15)";
    });

    deckCard.addEventListener("mouseleave", function () {
      this.style.transform = "";
      this.style.boxShadow = "";
    });


    return deckCard;
  }


    // --- Menu Handling Functions ---
    function createDeckMenuElement(deck) {
        const menu = document.createElement('ul');
        menu.className = 'deck-context-menu'; // Uses the styles defined in HTML/CSS
        menu.innerHTML = `
            <li><button data-action="study"><i class="fas fa-book-open"></i> Study Deck</button></li>
            <li><button data-action="edit"><i class="fas fa-pencil-alt"></i> Edit Deck</button></li>
            <li><button data-action="delete" class="delete-option"><i class="fas fa-trash"></i> Delete Deck</button></li>
        `;

        menu.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent menu click from closing menu immediately
                const action = e.currentTarget.dataset.action;
                handleMenuAction(action, deck);
                closeActiveMenu(); // Close menu after action is handled
            });
        });

        return menu;
    }

    function showDeckMenu(triggerButton, deck) {
        const menu = createDeckMenuElement(deck);
        // Append the menu *to the button*
        triggerButton.appendChild(menu);

        // Add a class to the button to signal that the menu is open (for CSS)
        triggerButton.classList.add('menu-open');

        activeMenuButton = triggerButton; // Set the button as the active menu trigger
    }

    function closeActiveMenu() {
        if (activeMenuButton) {
            // Find the menu element inside the active button
            const menu = activeMenuButton.querySelector('.deck-context-menu');
            if (menu) {
                 // Add a class for fade-out animation if desired, then remove
                 // menu.classList.add('fade-out-menu'); // Need CSS for this
                 // menu.addEventListener('animationend', () => menu.remove(), { once: true });

                 menu.remove(); // Remove the menu element directly
            }
            activeMenuButton.classList.remove('menu-open'); // Remove the class
            activeMenuButton = null; // Reset the active menu button
        }
    }

    // Close menu when clicking anywhere on the page EXCEPT the active menu button itself
    document.addEventListener('click', (e) => {
        // Check if a menu is open AND the click target is NOT the active menu button
        // OR is NOT inside the currently open menu (which is inside the button)
        if (activeMenuButton && !activeMenuButton.contains(e.target)) {
             closeActiveMenu();
        }
    });


    // --- Handle Menu Actions ---
    function handleMenuAction(action, deck) {
        switch (action) {
            case 'study':
                location.href = `/study?deck_id=${deck.id}`;
                break;
            case 'edit':
                location.href = `/decks/${deck.id}/edit`;
                break;
            case 'delete':
                if (confirm(`Are you sure you want to delete the deck "${deck.name}"? This action cannot be undone.`)) {
                    deleteDeck(deck.id, deck.name);
                }
                break;
            default:
                console.warn("Unknown menu action:", action);
        }
    }

    // --- Delete Deck API Call ---
    async function deleteDeck(deckId, deckName) {
        try {
            const deckCardElement = document.querySelector(`.deck-card[data-deck-id="${deckId}"]`);
             // Optional: Add loading indicator to the card being deleted
            if(deckCardElement) deckCardElement.style.opacity = 0.5; // Simple visual indicator


            const response = await fetch(`/api/decks/${deckId}`, {
                method: 'DELETE',
                 headers: { 'Accept': 'application/json' }
            });
            const result = await response.json();

            if (response.ok && result.success) {
                alert(`Deck "${deckName}" deleted successfully.`);
                if (deckCardElement) {
                    deckCardElement.classList.add('fade-out'); // Assumes you have a fade-out CSS class
                    deckCardElement.addEventListener('animationend', () => {
                        deckCardElement.remove();
                         loadDashboardStats(); // Refresh stats after removing card
                    }, { once: true }); // Ensure listener runs only once
                } else {
                     loadDecks(); // Fallback: reload all decks if the specific element wasn't found/removed
                }

            } else {
                console.error("Error deleting deck:", result);
                alert(`Error deleting deck "${deckName}": ${result.errors?.general || result.message || 'Unknown error'}`);
                 // Remove loading indicator if deletion failed
                 if(deckCardElement) deckCardElement.style.opacity = 1;
            }
        } catch (error) {
            console.error("Failed to delete deck:", error);
            alert(`An unexpected error occurred while deleting deck "${deckName}".`);
             if(deckCardElement) deckCardElement.style.opacity = 1;
        }
    }

     // Helper to update dashboard stats display after a deck is deleted
     // This is simplified; loadDashboardStats() is called after successful deletion now.
     // function updateDashboardStatsDisplay() { ... }


  // --- Fetch Decks ---
  async function loadDecks() {
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
           if (statsTotalDecksElement) statsTotalDecksElement.textContent = 0;
        } else {
          result.decks.forEach((deck, index) => {
            const deckCardElement = createDeckCardElement(deck);
            deckCardElement.style.animationDelay = `${index * 0.1}s`;
            decksGrid.appendChild(deckCardElement);
          });
            if (statsTotalDecksElement) {
                statsTotalDecksElement.textContent = result.decks.length;
            }
        }
      } else {
        decksGrid.innerHTML = `<p>Error loading decks: ${result.errors?.general || 'Unknown error'}</p>`;
      }
    } catch (error) {
      console.error("Failed to load decks:", error);
      decksGrid.innerHTML = "<p>Could not load decks. Please try again later.</p>";
    }
  }

  // --- Fetch Dashboard Stats ---
  async function loadDashboardStats() {
      try {
          if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = '...';
          if(statsStudyTimeElement) statsStudyTimeElement.textContent = '...';

          const response = await fetch("/api/stats/dashboard");
          if (!response.ok) {
              console.error("Failed to fetch dashboard stats", response.status);
              if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'N/A';
              if(statsStudyTimeElement) statsStudyTimeElement.textContent = 'N/A';
               return;
          }
          const result = await response.json();

          if (result.success && result.stats) {
              const stats = result.stats;
              if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = stats.cards_mastered !== undefined ? stats.cards_mastered : 'N/A';
              if(statsStudyTimeElement) statsStudyTimeElement.textContent = stats.total_study_time_formatted || 'N/A';
          } else {
               console.error("API returned error for dashboard stats:", result);
              if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'Error';
              if(statsStudyTimeElement) statsStudyTimeElement.textContent = 'Error';
          }

      } catch (error) {
          console.error("Error during loadDashboardStats:", error);
           if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'Error';
           if(statsStudyTimeElement) statsStudyTimeElement.textContent = 'Error';
      }
  }

  // --- Initial Load ---
  loadDecks();
  loadDashboardStats();

  // Animation for stat cards on dashboard (kept existing)
  const statCards = document.querySelectorAll(".stats-grid .stat-card");
  statCards.forEach((card, index) => {
      card.style.animationDelay = `${index * 0.1}s`;
       card.addEventListener("mouseenter", function () { this.style.transform = "translateY(-5px)"; this.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.15)"; });
       card.addEventListener("mouseleave", function () { this.style.transform = ""; this.style.boxShadow = ""; });
  });

    // Ensure any existing menus are closed on page load (safety)
     closeActiveMenu();
});