document.addEventListener("DOMContentLoaded", () => {
  const decksGrid = document.querySelector(".decks-grid");
  const statsTotalDecks = document.querySelector(".stats-grid .stat-card:nth-child(1) .stat-info p"); // Assuming this structure for total decks stat

  function createDeckCardElement(deck) {
    const deckCard = document.createElement("div");
    deckCard.className = "deck-card fade-in-up"; // Apply animation class

    const masteredPercentage = deck.mastered_percentage !== undefined ? deck.mastered_percentage.toFixed(0) : 0;
    const cardCount = deck.card_count || 0;
    const tagsHtml = deck.tags ? deck.tags.split(',').map(tag => `<span class="tag-item">${tag.trim()}</span>`).join(' ') : 'No tags';


    deckCard.innerHTML = `
      <div class="deck-header">
        <h3>${deck.name}</h3>
        <span class="card-count">${cardCount} card${cardCount !== 1 ? 's' : ''}</span>
      </div>
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
        <button class="btn secondary-btn" onclick="location.href='/study?deck_id=${deck.id}'">
          Study Now
        </button>
        <button class="btn icon-btn" data-deck-id="${deck.id}">
          <i class="fas fa-ellipsis-v"></i>
        </button>
      </div>
    `;

    // Add hover effect
    deckCard.addEventListener("mouseenter", function () {
      this.style.transform = "translateY(-5px)"; // Adjusted hover effect
      this.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.15)";
    });

    deckCard.addEventListener("mouseleave", function () {
      this.style.transform = "";
      this.style.boxShadow = "";
    });

    // Ellipsis menu functionality
    const menuButton = deckCard.querySelector(".icon-btn");
    if (menuButton) {
      menuButton.addEventListener("click", (e) => {
        e.stopPropagation();
        const deckId = e.currentTarget.dataset.deckId;
        // Placeholder for menu actions
        alert(`Menu for deck ID: ${deckId}. Options: Edit, Delete, Share, etc.`);
        // TODO: Implement actual dropdown menu
      });
    }
    return deckCard;
  }

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
        decksGrid.innerHTML = ""; // Clear existing mock data or loading state
        if (result.decks.length === 0) {
          decksGrid.innerHTML = "<p>No decks found. Create your first deck!</p>";
        } else {
          result.decks.forEach((deck, index) => {
            const deckCardElement = createDeckCardElement(deck);
            deckCardElement.style.animationDelay = `${index * 0.1}s`;
            decksGrid.appendChild(deckCardElement);
          });
        }
        if (statsTotalDecks) {
            statsTotalDecks.textContent = result.decks.length;
        }
      } else {
        decksGrid.innerHTML = `<p>Error loading decks: ${result.errors?.general || 'Unknown error'}</p>`;
      }
    } catch (error) {
      console.error("Failed to load decks:", error);
      decksGrid.innerHTML = "<p>Could not load decks. Please try again later.</p>";
    }
  }

  loadDecks();

  // Remove or comment out the old setTimeout(loadMoreDecks, 1500)
});