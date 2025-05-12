// static/js/results.js
// Remove or comment out: import { Chart } from "@/components/ui/chart";
// Ensure Chart.js is loaded via script tag in results.html
document.addEventListener("DOMContentLoaded", () => {

    // Get DOM elements for summary stats (same structure as dashboard for consistency)
    const totalCardsReviewedElement = document.querySelector(".stats-list .stat-item:nth-child(1) .stat-value");
    const averageAccuracyElement = document.querySelector(".stats-list .stat-item:nth-child(2) .stat-value"); // Will show Avg Rating
    const studyStreakElement = document.querySelector(".stats-list .stat-item:nth-child(3) .stat-value");
    const timeStudiedElement = document.querySelector(".stats-list .stat-item:nth-child(4) .stat-value");

    // Get DOM element for the chart canvas
    const performanceChartCanvas = document.getElementById("performanceChart");
     let performanceChart = null; // Variable to hold the Chart.js instance

    // Get DOM element for recent activity list
    const activityListElement = document.querySelector(".activity-list");
    function escapeHtml(unsafe) {
         if (typeof unsafe !== 'string') return '';
         return unsafe
              .replace(/&/g, "&")
              .replace(/</g, "<")
              .replace(/>/g, ">")
              .replace(/"/g, "\"")
              .replace(/'/g, "'");
      }


    // --- Load Summary Stats ---
    // Reusing the dashboard stats API for consistency
    async function loadSummaryStats() {
         try {
            // Optionally show loading indicators
            if(totalCardsReviewedElement) totalCardsReviewedElement.textContent = '...';
            if(averageAccuracyElement) averageAccuracyElement.textContent = '...';
            if(studyStreakElement) studyStreakElement.textContent = '...';
            if(timeStudiedElement) timeStudiedElement.textContent = '...';

            const response = await fetch("/api/stats/dashboard"); // Reuse dashboard stats API
            if (!response.ok) {
                console.error("Failed to fetch summary stats", response.status);
                 if(totalCardsReviewedElement) totalCardsReviewedElement.textContent = 'N/A';
                 if(averageAccuracyElement) averageAccuracyElement.textContent = 'N/A';
                 if(studyStreakElement) studyStreakElement.textContent = 'N/A';
                 if(timeStudiedElement) timeStudiedElement.textContent = 'N/A';
                 return;
            }
            const result = await response.json();

             if (result.success && result.stats) {
                const stats = result.stats;
                // Note: The dashboard API provides: total_decks, cards_mastered, total_study_time_formatted, review_streak_days
                // We need to map these to the results page stats: Total Cards Reviewed, Average Accuracy, Study Streak, Time Studied
                // We don't have 'Total Cards Reviewed' or 'Average Accuracy' directly in dashboard stats API.
                // We should fetch these separately or update the dashboard stats API to include them.
                // For now, let's use data we *do* have or fetch separately.
                // Total Cards Reviewed = Total reviews from review_logs (needs a new API call or update dashboard API)
                // Average Accuracy = Avg rating from review_logs (needs a new API call or update dashboard API)
                // Study Streak = stats.review_streak_days
                // Time Studied = stats.total_study_time_formatted

                // Option 1: Fetch Total Reviews & Avg Rating separately (more API calls)
                // Option 2: Update api_get_dashboard_stats to return these (cleaner)
                // Option 3: Fetch data from /api/stats/performance and calculate/extract totals here.
                // Option 3 is reasonable as performance API returns daily reviews/ratings.

                 // Let's fetch from /api/stats/performance to get totals for the period
                 const perfResponse = await fetch("/api/stats/performance");
                 if(perfResponse.ok) {
                     const perfResult = await perfResponse.json();
                     if(perfResult.success && perfResult.performance_data) {
                         const totalReviews = perfResult.performance_data.datasets[0].data.reduce((sum, count) => sum + count, 0);
                         const validRatings = perfResult.performance_data.datasets[1].data.filter(r => r !== null);
                         const averageRating = validRatings.length > 0 ? (validRatings.reduce((sum, rating) => sum + rating, 0) / validRatings.length).toFixed(2) : 'N/A';

                          if(totalCardsReviewedElement) totalCardsReviewedElement.textContent = totalReviews;
                          if(averageAccuracyElement) averageAccuracyElement.textContent = `${averageRating} (Avg Rating)`; // Label correctly
                     }
                 }


                if(studyStreakElement) studyStreakElement.textContent = stats.review_streak_days !== undefined ? `${stats.review_streak_days} days` : 'N/A';
                if(timeStudiedElement) timeStudiedElement.textContent = stats.total_study_time_formatted || 'N/A';


             } else {
                console.error("API returned error for summary stats:", result);
                 if(totalCardsReviewedElement) totalCardsReviewedElement.textContent = 'Error';
                 if(averageAccuracyElement) averageAccuracyElement.textContent = 'Error';
                 if(studyStreakElement) studyStreakElement.textContent = 'Error';
                 if(timeStudiedElement) timeStudiedElement.textContent = 'Error';
             }

         } catch (error) {
             console.error("Error during loadSummaryStats:", error);
              if(totalCardsReviewedElement) totalCardsReviewedElement.textContent = 'Error';
              if(averageAccuracyElement) averageAccuracyElement.textContent = 'Error';
              if(studyStreakElement) studyStreakElement.textContent = 'Error';
              if(timeStudiedElement) timeStudiedElement.textContent = 'Error';
         }
    }


    // --- Load Performance Chart ---
     async function loadPerformanceChart() {
         if (!performanceChartCanvas) {
             console.error("Performance chart canvas not found.");
             return;
         }

         try {
              const response = await fetch("/api/stats/performance");
             if (!response.ok) {
                 console.error("Failed to fetch performance data", response.status);
                 // Display error message in chart area
                 const errorDiv = document.createElement('div');
                 errorDiv.textContent = 'Error loading performance data.';
                 errorDiv.style.color = 'red';
                 performanceChartCanvas.parentNode.replaceChild(errorDiv, performanceChartCanvas);
                 return;
             }
             const result = await response.json();

             if (result.success && result.performance_data) {
                 const chartData = result.performance_data;

                 // Destroy existing chart instance if it exists
                 if (performanceChart) {
                     performanceChart.destroy();
                 }

                 const ctx = performanceChartCanvas.getContext("2d");
                 performanceChart = new Chart(ctx, {
                    type: 'bar', // Use bar for reviews, line for rating
                    data: {
                      labels: chartData.labels, // Dates
                      datasets: [
                        {
                          label: chartData.datasets[0].label, // 'Cards Reviewed'
                          data: chartData.datasets[0].data,
                          backgroundColor: 'rgba(54, 162, 235, 0.7)',
                          borderColor: 'rgba(54, 162, 235, 1)',
                          borderWidth: 1,
                          yAxisID: 'y-reviews',
                          type: 'bar' // Explicitly set type
                        },
                         {
                          label: chartData.datasets[1].label, // 'Average Rating'
                          data: chartData.datasets[1].data,
                          backgroundColor: 'rgba(75, 192, 192, 0.7)',
                          borderColor: 'rgba(75, 192, 192, 1)',
                           type: 'line',
                          fill: false,
                          yAxisID: 'y-rating',
                          tension: 0.1,
                           pointBackgroundColor: 'rgba(75, 192, 192, 1)',
                           pointBorderColor: '#fff',
                           pointHoverBackgroundColor: '#fff',
                           pointHoverBorderColor: 'rgba(75, 192, 192, 1)',
                           spanGaps: true // Connect points even if data is null
                        }
                      ],
                    },
                    options: {
                      responsive: true,
                      maintainAspectRatio: false,
                       interaction: {
                           mode: 'index',
                           intersect: false,
                       },
                      scales: {
                        'y-reviews': {
                          type: 'linear',
                          position: 'left',
                          beginAtZero: true,
                           title: {
                                display: true,
                                text: 'Cards Reviewed'
                           },
                           min: 0 // Ensure minimum is 0
                        },
                         'y-rating': {
                           type: 'linear',
                           position: 'right',
                           beginAtZero: false, // Rating doesn't start at 0
                            title: {
                                display: true,
                                text: 'Average Rating'
                           },
                           min: 1, // Min rating is 1
                           max: 3, // Max rating is 3 (based on our current 1-3 scale)
                            grid: {
                                drawOnChartArea: false // Only draw grid lines for the left axis
                           }
                        }
                      },
                       plugins: {
                           legend: {
                               display: true
                           },
                           tooltip: {
                               callbacks: {
                                   label: function(context) {
                                       let label = context.dataset.label || '';
                                       if (label) {
                                           label += ': ';
                                       }
                                       if (context.parsed.y !== null) {
                                           label += context.parsed.y;
                                           if(context.dataset.label === 'Average Rating') {
                                                label += ' (Avg)';
                                           }
                                       }
                                       return label;
                                   }
                               }
                           }
                       }
                    },
                 });

             } else {
                 console.error("API returned error for performance data:", result);
                 const errorDiv = document.createElement('div');
                 errorDiv.textContent = `Error loading performance data: ${result.errors?.general || 'Unknown error'}`;
                 errorDiv.style.color = 'red';
                 performanceChartCanvas.parentNode.replaceChild(errorDiv, performanceChartCanvas);
             }

         } catch (error) {
             console.error("Error during loadPerformanceChart:", error);
             const errorDiv = document.createElement('div');
             errorDiv.textContent = `Error loading performance data: ${error.message}`;
             errorDiv.style.color = 'red';
             if (performanceChartCanvas) performanceChartCanvas.parentNode.replaceChild(errorDiv, performanceChartCanvas);
         }
     }


    // --- Load Recent Activity ---
    async function loadRecentActivity() {
        if (!activityListElement) {
            console.error("Activity list element not found.");
            return;
        }
         activityListElement.innerHTML = "<p>Loading recent activity...</p>"; // Loading indicator


        try {
             const response = await fetch("/api/stats/activity");
             if (!response.ok) {
                 console.error("Failed to fetch recent activity", response.status);
                 activityListElement.innerHTML = "<p style='color: red;'>Error loading recent activity.</p>";
                 return;
             }
             const result = await response.json();

             if (result.success && result.activity) {
                 if (result.activity.length === 0) {
                     activityListElement.innerHTML = "<p>No recent activity.</p>";
                 } else {
                     activityListElement.innerHTML = ""; // Clear loading/previous content
                     result.activity.forEach(activity => {
                         const activityItem = document.createElement('div');
                         activityItem.className = 'activity-item';
                         activityItem.innerHTML = `
                             <div class="activity-icon">
                                 <i class="${activity.icon || 'fas fa-question-circle'}"></i>
                             </div>
                             <div class="activity-details">
                                 <h4>${escapeHtml(activity.type)}</h4>
                                 <p>${escapeHtml(activity.description)}</p>
                                 <span class="activity-time">${formatTimeAgo(activity.time)}</span>
                             </div>
                         `;
                         activityListElement.appendChild(activityItem);
                     });
                 }
             } else {
                 console.error("API returned error for recent activity:", result);
                 activityListElement.innerHTML = `<p style='color: red;'>Error loading recent activity: ${result.errors?.general || 'Unknown error'}</p>`;
             }

         } catch (error) {
             console.error("Error during loadRecentActivity:", error);
             activityListElement.innerHTML = `<p style='color: red;'>Error loading recent activity: ${error.message}</p>`;
         }
    }

    // Helper function to format time ago (simplified)
    function formatTimeAgo(timestamp) {
        const now = new Date();
        const past = new Date(timestamp);
        const diffInSeconds = Math.floor((now - past) / 1000);

        if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`; // Approx month
        return past.toLocaleDateString(); // Fallback to date

    }
     // Helper to prevent XSS (should ideally be in a global JS file)
     

    // --- Initial Load ---
    // Check if we are on the dashboard or results page
    const path = window.location.pathname;

    if (path === '/dashboard') {
        loadDecks();
        loadDashboardStats();
    } else if (path === '/results') {
        loadSummaryStats(); // Load summary stats for results page too
        loadPerformanceChart();
        loadRecentActivity();
    }

    // Animation for stat cards on dashboard (keep existing)
    if (path === '/dashboard') {
        const statCards = document.querySelectorAll(".stats-grid .stat-card");
        statCards.forEach((card, index) => {
            card.style.animationDelay = `${index * 0.1}s`;
            // Hover effects can also be kept if desired
             card.addEventListener("mouseenter", function () { /* ... */ });
             card.addEventListener("mouseleave", function () { /* ... */ });
        });
         // Animation for deck cards fade-in-up is handled in loadDecks
    }
});