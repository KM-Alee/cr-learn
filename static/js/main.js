document.addEventListener("DOMContentLoaded", () => {
  // Mobile Menu Toggle
  const mobileMenuToggle = document.querySelector(".mobile-menu-toggle");
  const navLinks = document.querySelector(".nav-links");

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener("click", function () {
      this.classList.toggle("active");
      navLinks.classList.toggle("active");

      // Toggle menu icon animation
      const spans = this.querySelectorAll("span");
      if (this.classList.contains("active")) {
        spans[0].style.transform = "translateY(8px) rotate(45deg)";
        spans[1].style.opacity = "0";
        spans[2].style.transform = "translateY(-8px) rotate(-45deg)";
      } else {
        spans[0].style.transform = "none";
        spans[1].style.opacity = "1";
        spans[2].style.transform = "none";
      }
    });
  }

  // Testimonial Slider
  const testimonialCards = document.querySelectorAll(".testimonial-card");
  const dots = document.querySelectorAll(".dot");
  const prevBtn = document.querySelector(".prev-testimonial");
  const nextBtn = document.querySelector(".next-testimonial");

  if (testimonialCards.length > 0) {
    let currentIndex = 0;

    function showTestimonial(index) {
      testimonialCards.forEach((card) => card.classList.remove("active"));
      dots.forEach((dot) => dot.classList.remove("active"));

      testimonialCards[index].classList.add("active");
      dots[index].classList.add("active");
    }

    function nextTestimonial() {
      currentIndex = (currentIndex + 1) % testimonialCards.length;
      showTestimonial(currentIndex);
    }

    function prevTestimonial() {
      currentIndex =
        (currentIndex - 1 + testimonialCards.length) % testimonialCards.length;
      showTestimonial(currentIndex);
    }

    // Event listeners for testimonial navigation
    if (nextBtn) nextBtn.addEventListener("click", nextTestimonial);
    if (prevBtn) prevBtn.addEventListener("click", prevTestimonial);

    // Event listeners for dots
    dots.forEach((dot, index) => {
      dot.addEventListener("click", () => {
        currentIndex = index;
        showTestimonial(currentIndex);
      });
    });

    // Auto-rotate testimonials
    setInterval(nextTestimonial, 5000);
  }

  // Scroll reveal animations
  const scrollRevealElements = document.querySelectorAll(".scroll-reveal");

  function checkScroll() {
    scrollRevealElements.forEach((element) => {
      const elementTop = element.getBoundingClientRect().top;
      const windowHeight = window.innerHeight;

      if (elementTop < windowHeight * 0.85) {
        element.classList.add("revealed");
      }
    });
  }

  // Check elements on page load
  checkScroll();

  // Check elements on scroll
  window.addEventListener("scroll", checkScroll);

  // Animate feature cards on scroll
  const featureCards = document.querySelectorAll(".feature-card");

  function animateFeatureCards() {
    featureCards.forEach((card, index) => {
      const cardTop = card.getBoundingClientRect().top;
      const windowHeight = window.innerHeight;

      if (cardTop < windowHeight * 0.85) {
        card.style.animationDelay = `${index * 0.2}s`;
        card.classList.add("fade-in-up");
      }
    });
  }

  // Check feature cards on page load
  animateFeatureCards();

  // Check feature cards on scroll
  window.addEventListener("scroll", animateFeatureCards);

  // Pulse animation for CTA buttons
  const ctaButtons = document.querySelectorAll(".primary-btn");

  ctaButtons.forEach((button) => {
    button.addEventListener("mouseenter", function () {
      this.classList.add("pulse");
    });

    button.addEventListener("mouseleave", function () {
      this.classList.remove("pulse");
    });
  });

  // Typing animation for hero title
  const heroTitle = document.querySelector(".hero h2");

  if (heroTitle) {
    heroTitle.classList.add("typing-animation");
  }
});
