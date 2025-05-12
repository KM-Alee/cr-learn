document.addEventListener("DOMContentLoaded", () => {
  // Tab switching functionality
  const tabs = document.querySelectorAll(".auth-tab")
  const forms = document.querySelectorAll(".auth-form")
  const loginForm = document.getElementById("login-form")
  const signupForm = document.getElementById("signup-form")
  const formsContainer = document.querySelector(".auth-forms-container")

  // Check URL parameters for initial tab
  const urlParams = new URLSearchParams(window.location.search)
  const tabParam = urlParams.get("tab")

  if (tabParam === "signup") {
    // Activate signup tab
    document.querySelector('[data-tab="signup"]').classList.add("active")
    document.querySelector('[data-tab="login"]').classList.remove("active")
    signupForm.style.display = "flex"
    loginForm.style.display = "none"
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Remove active class from all tabs
      tabs.forEach((t) => t.classList.remove("active"))

      // Add active class to clicked tab
      tab.classList.add("active")

      // Hide all forms
      forms.forEach((form) => {
        form.style.display = "none"
      })

      // Show the selected form
      const formId = tab.getAttribute("data-tab") + "-form"
      const form = document.getElementById(formId)
      form.style.display = "flex"

      // Trigger animations
      const formElements = form.querySelectorAll(".fade-in-up")
      formElements.forEach((el) => {
        el.classList.remove("fade-in-up")
        void el.offsetWidth // Force reflow
        el.classList.add("fade-in-up")
      })

      // Scroll to top when switching tabs
      if (formsContainer) {
        formsContainer.scrollTop = 0
      }
    })
  })

  // Password strength meter
  const passwordInput = document.getElementById("signup-password")
  const strengthMeter = document.querySelector(".strength-meter span")
  const strengthText = document.querySelector(".strength-text")

  if (passwordInput) {
    passwordInput.addEventListener("input", updatePasswordStrength)
  }

  function updatePasswordStrength() {
    const password = passwordInput.value
    let strength = 0
    let feedback = "Weak password"

    // Calculate password strength
    if (password.length >= 8) strength += 1
    if (password.match(/[A-Z]/)) strength += 1
    if (password.match(/[0-9]/)) strength += 1
    if (password.match(/[^A-Za-z0-9]/)) strength += 1

    // Update UI based on strength
    switch (strength) {
      case 0:
      case 1:
        strengthMeter.style.width = "25%"
        strengthMeter.style.backgroundColor = "var(--color-danger)"
        feedback = "Weak password"
        break
      case 2:
        strengthMeter.style.width = "50%"
        strengthMeter.style.backgroundColor = "var(--color-warning)"
        feedback = "Moderate password"
        break
      case 3:
        strengthMeter.style.width = "75%"
        strengthMeter.style.backgroundColor = "var(--color-primary)"
        feedback = "Strong password"
        break
      case 4:
        strengthMeter.style.width = "100%"
        strengthMeter.style.backgroundColor = "var(--color-success)"
        feedback = "Very strong password"
        break
    }

    strengthText.textContent = feedback
    strengthText.style.color = strengthMeter.style.backgroundColor
  }

  // Populate country dropdown
  const countrySelect = document.getElementById("signup-country")
  if (countrySelect) {
    const countries = [
      "Afghanistan",
      "Albania",
      "Algeria",
      "Andorra",
      "Angola",
      "Argentina",
      "Armenia",
      "Australia",
      "Austria",
      "Azerbaijan",
      "Bahamas",
      "Bahrain",
      "Bangladesh",
      "Barbados",
      "Belarus",
      "Belgium",
      "Belize",
      "Benin",
      "Bhutan",
      "Bolivia",
      "Bosnia and Herzegovina",
      "Botswana",
      "Brazil",
      "Brunei",
      "Bulgaria",
      "Burkina Faso",
      "Burundi",
      "Cambodia",
      "Cameroon",
      "Canada",
      "Cape Verde",
      "Central African Republic",
      "Chad",
      "Chile",
      "China",
      "Colombia",
      "Comoros",
      "Congo",
      "Costa Rica",
      "Croatia",
      "Cuba",
      "Cyprus",
      "Czech Republic",
      "Denmark",
      "Djibouti",
      "Dominica",
      "Dominican Republic",
      "East Timor",
      "Ecuador",
      "Egypt",
      "El Salvador",
      "Equatorial Guinea",
      "Eritrea",
      "Estonia",
      "Ethiopia",
      "Fiji",
      "Finland",
      "France",
      "Gabon",
      "Gambia",
      "Georgia",
      "Germany",
      "Ghana",
      "Greece",
      "Grenada",
      "Guatemala",
      "Guinea",
      "Guinea-Bissau",
      "Guyana",
      "Haiti",
      "Honduras",
      "Hungary",
      "Iceland",
      "India",
      "Indonesia",
      "Iran",
      "Iraq",
      "Ireland",
      "Israel",
      "Italy",
      "Jamaica",
      "Japan",
      "Jordan",
      "Kazakhstan",
      "Kenya",
      "Kiribati",
      "North Korea",
      "South Korea",
      "Kuwait",
      "Kyrgyzstan",
      "Laos",
      "Latvia",
      "Lebanon",
      "Lesotho",
      "Liberia",
      "Libya",
      "Liechtenstein",
      "Lithuania",
      "Luxembourg",
      "Macedonia",
      "Madagascar",
      "Malawi",
      "Malaysia",
      "Maldives",
      "Mali",
      "Malta",
      "Marshall Islands",
      "Mauritania",
      "Mauritius",
      "Mexico",
      "Micronesia",
      "Moldova",
      "Monaco",
      "Mongolia",
      "Montenegro",
      "Morocco",
      "Mozambique",
      "Myanmar",
      "Namibia",
      "Nauru",
      "Nepal",
      "Netherlands",
      "New Zealand",
      "Nicaragua",
      "Niger",
      "Nigeria",
      "Norway",
      "Oman",
      "Pakistan",
      "Palau",
      "Panama",
      "Papua New Guinea",
      "Paraguay",
      "Peru",
      "Philippines",
      "Poland",
      "Portugal",
      "Qatar",
      "Romania",
      "Russia",
      "Rwanda",
      "Saint Kitts and Nevis",
      "Saint Lucia",
      "Saint Vincent and the Grenadines",
      "Samoa",
      "San Marino",
      "Sao Tome and Principe",
      "Saudi Arabia",
      "Senegal",
      "Serbia",
      "Seychelles",
      "Sierra Leone",
      "Singapore",
      "Slovakia",
      "Slovenia",
      "Solomon Islands",
      "Somalia",
      "South Africa",
      "Spain",
      "Sri Lanka",
      "Sudan",
      "Suriname",
      "Swaziland",
      "Sweden",
      "Switzerland",
      "Syria",
      "Taiwan",
      "Tajikistan",
      "Tanzania",
      "Thailand",
      "Togo",
      "Tonga",
      "Trinidad and Tobago",
      "Tunisia",
      "Turkey",
      "Turkmenistan",
      "Tuvalu",
      "Uganda",
      "Ukraine",
      "United Arab Emirates",
      "United Kingdom",
      "United States",
      "Uruguay",
      "Uzbekistan",
      "Vanuatu",
      "Vatican City",
      "Venezuela",
      "Vietnam",
      "Yemen",
      "Zambia",
      "Zimbabwe",
    ]

    countries.forEach((country) => {
      const option = document.createElement("option")
      option.value = country
      option.textContent = country
      countrySelect.appendChild(option)
    })
  }

  // Clear all error messages
  function clearErrors(form) {
    const errorElements = form.querySelectorAll(".error-message")
    errorElements.forEach((element) => {
      element.style.display = "none"
    })

    const formGroups = form.querySelectorAll(".form-group")
    formGroups.forEach((group) => {
      group.classList.remove("error")
    })
  }

  // Display error messages
  function displayErrors(form, errors) {
    // Clear previous errors
    clearErrors(form)

    // Display new errors
    Object.keys(errors).forEach((field) => {
      const errorMessage = errors[field]
      const fieldElement = form.querySelector(`#${form.id.split("-")[0]}-${field}`)

      if (fieldElement) {
        const formGroup = fieldElement.closest(".form-group")
        if (formGroup) {
          formGroup.classList.add("error")
          const errorElement = formGroup.querySelector(".error-message")
          if (errorElement) {
            errorElement.textContent = errorMessage
            errorElement.style.display = "block"
          }
        }
      } else if (field === "general") {
        // Display general error at the top of the form
        const generalError = document.createElement("div")
        generalError.className = "error-message general-error"
        generalError.textContent = errorMessage
        generalError.style.display = "block"
        generalError.style.marginBottom = "10px"
        form.prepend(generalError)
      }
    })
  }

  // Form validation and submission
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault()

      // Clear previous errors
      clearErrors(loginForm)

      // Get form data
      const formData = new FormData(loginForm)

      // Show loading state
      const loginBtn = loginForm.querySelector("button[type='submit']")
      loginBtn.classList.add("loading")

      // Send AJAX request
      fetch("/api/login", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      })
        .then((response) => response.json())
        .then((data) => {
          loginBtn.classList.remove("loading")

          if (data.success) {
            // Show success animation
            loginForm.classList.add("form-success")
            setTimeout(() => {
              // Redirect to dashboard
              window.location.href = data.redirect
            }, 500)
          } else {
            // Display errors
            displayErrors(loginForm, data.errors)
          }
        })
        .catch((error) => {
          loginBtn.classList.remove("loading")
          console.error("Error:", error)
          displayErrors(loginForm, { general: "An error occurred. Please try again." })
        })
    })
  }

  if (signupForm) {
    signupForm.addEventListener("submit", (e) => {
      e.preventDefault()

      // Clear previous errors
      clearErrors(signupForm)

      // Get form data
      const formData = new FormData(signupForm)

      // Show loading state
      const signupBtn = signupForm.querySelector("button[type='submit']")
      signupBtn.classList.add("loading")

      // Send AJAX request
      fetch("/api/signup", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      })
        .then((response) => response.json())
        .then((data) => {
          signupBtn.classList.remove("loading")

          if (data.success) {
            // Show success animation
            signupForm.classList.add("form-success")
            setTimeout(() => {
              // Redirect to dashboard
              window.location.href = data.redirect
            }, 500)
          } else {
            // Display errors
            displayErrors(signupForm, data.errors)
          }
        })
        .catch((error) => {
          signupBtn.classList.remove("loading")
          console.error("Error:", error)
          displayErrors(signupForm, { general: "An error occurred. Please try again." })
        })
    })
  }

  // Add animation to floating cards
  const floatingCards = document.querySelectorAll(".floating-card")

  floatingCards.forEach((card, index) => {
    // Add hover effect
    card.addEventListener("mouseenter", function () {
      this.querySelector(".card-inner").style.transform = "rotateY(180deg)"
    })

    card.addEventListener("mouseleave", function () {
      this.querySelector(".card-inner").style.transform = "rotateY(0deg)"
    })

    // Auto-flip cards at intervals
    setTimeout(
      () => {
        setInterval(
          () => {
            if (!card.matches(":hover")) {
              // Only auto-flip if not being hovered
              const cardInner = card.querySelector(".card-inner")
              cardInner.style.transform = "rotateY(180deg)"

              setTimeout(() => {
                cardInner.style.transform = "rotateY(0deg)"
              }, 3000)
            }
          },
          8000 + index * 2000,
        ) // Stagger the animations
      },
      1000 + index * 1000,
    ) // Stagger the initial start
  })

  // Add scroll reveal animation for cards
  const observerOptions = {
    root: document.querySelector(".auth-image"),
    threshold: 0.1,
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1"
        entry.target.style.transform = "translateY(0)"
      }
    })
  }, observerOptions)

  floatingCards.forEach((card, index) => {
    card.style.opacity = "0"
    card.style.transform = "translateY(20px)"
    card.style.transition = "opacity 0.5s ease, transform 0.5s ease"
    card.style.transitionDelay = `${index * 0.1}s`
    observer.observe(card)
  })
})