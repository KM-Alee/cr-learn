document.addEventListener("DOMContentLoaded", () => {
  // Remove the words and rotateText related code

  // Flip card animation
  const cards = document.querySelectorAll(".flip-card");

  cards.forEach((card) => {
    setInterval(() => {
      const cardInner = card.querySelector(".card-inner");
      cardInner.style.transform = "rotateY(180deg)";

      setTimeout(() => {
        cardInner.style.transform = "rotateY(0deg)";
      }, 3000);
    }, 6000);
  });

  // Scroll reveal animations - Fixed to work on repeated scrolls
  const scrollRevealElements = document.querySelectorAll(".scroll-reveal");

  function checkScroll() {
    scrollRevealElements.forEach((element) => {
      const elementTop = element.getBoundingClientRect().top;
      const windowHeight = window.innerHeight;

      if (elementTop < windowHeight * 0.85) {
        element.classList.add("revealed");
      } else {
        // Remove the class when element is out of view to allow re-animation
        element.classList.remove("revealed");
      }
    });
  }

  // Check elements on page load
  checkScroll();

  // Check elements on scroll
  window.addEventListener("scroll", checkScroll);

  // Floating cards animation for auth pages
  const floatingCards = document.querySelectorAll(".floating-card");

  floatingCards.forEach((card) => {
    // Add random rotation
    const randomRotation = Math.random() * 10 - 5; // Between -5 and 5 degrees
    card.style.transform = `rotate(${randomRotation}deg)`;

    // Add hover effect
    card.addEventListener("mouseenter", function () {
      this.querySelector(".card-inner").style.transform = "rotateY(180deg)";
    });

    card.addEventListener("mouseleave", function () {
      this.querySelector(".card-inner").style.transform = "rotateY(0deg)";
    });
  });

  // Animate hero card on page load
  const heroCard = document.querySelector(".hero .card-inner");
  if (heroCard) {
    setTimeout(() => {
      heroCard.style.transform = "rotateY(180deg)";

      setTimeout(() => {
        heroCard.style.transform = "rotateY(0deg)";
      }, 3000);
    }, 2000);
  }

  // Shake animation for CTA buttons
  const ctaButtons = document.querySelectorAll(".shake-on-hover");

  ctaButtons.forEach((button) => {
    button.addEventListener("mouseenter", function () {
      this.classList.add("shake");

      setTimeout(() => {
        this.classList.remove("shake");
      }, 500);
    });
  });

  // Animate feature icons on scroll
  const featureIcons = document.querySelectorAll(".feature-icon");

  function animateFeatureIcons() {
    featureIcons.forEach((icon) => {
      const iconTop = icon.getBoundingClientRect().top;
      const windowHeight = window.innerHeight;

      if (iconTop < windowHeight * 0.75) {
        icon.classList.add("scale-in");
      } else {
        // Remove the class when element is out of view to allow re-animation
        icon.classList.remove("scale-in");
      }
    });
  }

  // Check icons on page load
  animateFeatureIcons();

  // Check icons on scroll
  window.addEventListener("scroll", animateFeatureIcons);

  // Testimonial animations
  const testimonialCards = document.querySelectorAll(".testimonial-card");

  function animateTestimonials() {
    testimonialCards.forEach((card) => {
      if (card.classList.contains("active")) {
        card.classList.add("testimonial-animation");
      } else {
        card.classList.remove("testimonial-animation");
      }
    });
  }

  // Add animation to footer links
  const footerLinks = document.querySelectorAll(".footer-link");

  footerLinks.forEach((link) => {
    link.classList.add("glow-on-hover");
  });

  // Fix typing animation in hero
  const heroTitle = document.querySelector(".hero h2");

  if (heroTitle) {
    // Remove the existing class first
    heroTitle.classList.remove("typing-animation");

    // Force a reflow
    void heroTitle.offsetWidth;

    // Add the class back
    heroTitle.classList.add("typing-animation");
  }

  // Initialize testimonial animations
  animateTestimonials();

  // Update testimonial animations when changing slides
  const prevBtn = document.querySelector(".prev-testimonial");
  const nextBtn = document.querySelector(".next-testimonial");
  const dots = document.querySelectorAll(".dot");

  if (prevBtn) {
    prevBtn.addEventListener("click", animateTestimonials);
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", animateTestimonials);
  }

  dots.forEach((dot) => {
    dot.addEventListener("click", animateTestimonials);
  });
});
