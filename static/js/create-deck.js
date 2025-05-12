document.addEventListener("DOMContentLoaded", () => {
  const deckName = document.getElementById("deck-name");
  const deckDescription = document.getElementById("deck-description");
  const tagInput = document.getElementById("tagInput");
  const tagsList = document.getElementById("tagsList");
  const addCardBtn = document.getElementById("addCard");
  const cardsList = document.getElementById("cardsList");
  const saveDraftBtn = document.getElementById("saveDraft");
  const createDeckBtn = document.getElementById("createDeck");

  let tags = [];
  let cards = [];

  tagInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && this.value.trim() !== "") {
      e.preventDefault();
      addTag(this.value.trim());
      this.value = "";
    }
  });

  function addTag(tagName) {
    if (!tags.includes(tagName)) {
      tags.push(tagName);
      renderTags();
    }
  }

  function renderTags() {
    tagsList.innerHTML = tags
      .map(
        (tag) => `
              <span class="tag">
                  ${tag}
                  <button class="remove-tag" onclick="removeTag('${tag}')">&times;</button>
              </span>
          `
      )
      .join("");
  }

  window.removeTag = (tag) => {
    tags = tags.filter((t) => t !== tag);
    renderTags();
  };

  addCardBtn.addEventListener("click", () => {
    addCard();
  });

  function addCard(front = "", back = "") {
    const cardId = Date.now();
    cards.push({ id: cardId, front, back });
    renderCards();
  }

  function renderCards() {
    cardsList.innerHTML = cards
      .map(
        (card) => `
              <div class="card-item" data-id="${card.id}">
                  <div class="card-preview">
                      <div class="card-side">
                          <h4>Front</h4>
                          <textarea placeholder="Question or term" oninput="updateCard(${card.id}, 'front', this.value)">${card.front}</textarea>
                      </div>
                      <div class="card-side">
                          <h4>Back</h4>
                          <textarea placeholder="Answer or definition" oninput="updateCard(${card.id}, 'back', this.value)">${card.back}</textarea>
                      </div>
                  </div>
                  <div class="card-actions">
                      <button class="btn icon-btn" onclick="moveCard(${card.id}, -1)">
                          <i class="fas fa-arrow-up"></i>
                      </button>
                      <button class="btn icon-btn" onclick="moveCard(${card.id}, 1)">
                          <i class="fas fa-arrow-down"></i>
                      </button>
                      <button class="btn icon-btn" onclick="deleteCard(${card.id})">
                          <i class="fas fa-trash"></i>
                      </button>
                  </div>
              </div>
          `
      )
      .join("");
  }

  window.updateCard = (id, side, value) => {
    const card = cards.find((c) => c.id === id);
    if (card) {
      card[side] = value;
    }
  };

  window.moveCard = (id, direction) => {
    const index = cards.findIndex((c) => c.id === id);
    if (index > -1) {
      const newIndex = index + direction;
      if (newIndex >= 0 && newIndex < cards.length) {
        const [card] = cards.splice(index, 1);
        cards.splice(newIndex, 0, card);
        renderCards();
      }
    }
  };

  window.deleteCard = (id) => {
    cards = cards.filter((c) => c.id !== id);
    renderCards();
  };

  saveDraftBtn.addEventListener("click", () => {
    saveDeck("draft");
  });

  createDeckBtn.addEventListener("click", () => {
    saveDeck("published");
  });

  function saveDeck(status) {
    const deck = {
      name: deckName.value,
      description: deckDescription.value,
      tags: tags,
      cards: cards,
      status: status,
    };

    // Here you would typically send this data to your backend
    console.log("Saving deck:", deck);
    alert(`Deck ${status === "draft" ? "saved as draft" : "created"}!`);
  }

  // Initialize with an empty card
  addCard();
});
