// static/js/leaderboard.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const leaderboardTbody = document.getElementById('leaderboard-tbody');
    if (!leaderboardTbody) {
        // console.log("Not on the leaderboard page, leaderboard.js will not run main logic.");
        return; // Exit if not on the leaderboard page
    }

    const loadingMessage = document.getElementById('loading-leaderboard');
    const noDataMessage = document.getElementById('no-leaderboard-data');
    const errorMessage = document.getElementById('leaderboard-error'); // Added error message element
    const leaderboardTable = document.querySelector('.leaderboard-table');

    const currentUserRankSection = document.getElementById('current-user-rank-section');
    const currentUserRankEl = document.getElementById('currentUserRank');
    const currentUserUsernameEl = document.getElementById('currentUserUsername');
    const currentUserPointsEl = document.getElementById('currentUserPoints');
    const currentUserOutOfTopEl = document.getElementById('currentUserOutOfTop'); // Added out of top message element


    const paginationControls = document.getElementById('paginationControls');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfoEl = document.getElementById('pageInfo');

    // Optional: Admin populate button (if you added it to HTML)
    const populateLeaderboardBtn = document.getElementById('populateLeaderboardBtn');

    // --- State Variables ---
    let currentPage = 1;
    let totalPages = 0; // Initialize to 0
    let currentUserId = null; 

    // --- Helper to get current user ID ---
    // This assumes the /api/leaderboard response will include the logged-in user's ID.
    // If not, you might need a separate call or pass it via server-side rendering.
    // The API response already includes 'current_user_rank' which has the user_id.
    // We can grab the user_id from there if it exists.
    function getUserIdFromApiResponse(result) {
        if (result && result.current_user_rank && result.current_user_rank.user_id !== undefined) {
            return result.current_user_rank.user_id;
        }
        // Fallback if the API doesn't return current_user_rank or user_id
        // Could try session storage or another method if needed.
        // For now, rely on the API returning it.
        return null;
    }


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

    // --- Core Function: Fetch and Display Leaderboard ---
    async function fetchLeaderboard(page = 1) {
        // Validate page number
        if (page < 1 || (totalPages > 0 && page > totalPages)) {
             console.warn(`Attempted to fetch invalid page: ${page}. Current total pages: ${totalPages}`);
             return; // Do nothing for invalid pages
        }

        currentPage = page; // Update current page state

        // --- Show Loading State ---
        if(loadingMessage) loadingMessage.style.display = 'block';
        if(leaderboardTable) leaderboardTable.style.display = 'none';
        if(noDataMessage) noDataMessage.style.display = 'none';
        if(errorMessage) errorMessage.style.display = 'none'; // Hide previous error
        if(paginationControls) paginationControls.style.display = 'none';
        // if(currentUserRankSection) currentUserRankSection.style.display = 'none'; // Keep visible or hide depending on preference

        try {
            const response = await fetch(`/api/leaderboard?page=${currentPage}`);
            if (!response.ok) {
                // If 401, login_required should handle redirect, but adding check
                if (response.status === 401) {
                    console.warn("Authentication required for leaderboard API.");
                    window.location.href = '/auth?tab=login&next=' + encodeURIComponent(window.location.pathname);
                    return;
                }
                throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
            }
            const result = await response.json();

            // console.log("Leaderboard API response:", result); // Debug

            if (result.success) {
                const leaderboardEntries = result.leaderboard;
                const pagination = result.pagination;
                const currentUserRank = result.current_user_rank; // User's rank info or null

                totalPages = pagination.total_pages;
                
                // Get current user ID from the response if available
                if (currentUserId === null) { // Only fetch once if possible
                     currentUserId = getUserIdFromApiResponse(result);
                }


                // --- Display Current User's Rank Separately ---
                if (currentUserRankSection) {
                    if (currentUserRank) {
                        if(currentUserRankEl) currentUserRankEl.textContent = currentUserRank.rank.toLocaleString();
                        if(currentUserUsernameEl) currentUserUsernameEl.textContent = escapeHtml(currentUserRank.username);
                        if(currentUserPointsEl) currentUserPointsEl.textContent = currentUserRank.points.toLocaleString();

                        // Check if the current user is within the displayed range
                        const isUserInDisplayedList = leaderboardEntries.some(entry => entry.user_id === currentUserId);

                        if (!isUserInDisplayedList && currentUserOutOfTopEl) {
                            currentUserOutOfTopEl.style.display = 'block';
                        } else if (currentUserOutOfTopEl) {
                             currentUserOutOfTopEl.style.display = 'none';
                        }
                        currentUserRankSection.style.display = 'block';
                    } else {
                        // If user is logged in but has no rank/points in snapshot
                        if(currentUserRankEl) currentUserRankEl.textContent = 'N/A';
                        if(currentUserUsernameEl) currentUserUsernameEl.textContent = 'You';
                        if(currentUserPointsEl) currentUserPointsEl.textContent = '0';
                        if(currentUserOutOfTopEl) currentUserOutOfTopEl.style.display = 'none';
                         currentUserRankSection.style.display = 'block'; // Still show the section

                        // If user is not logged in, currentUserRank will be null, hide section
                        if (!currentUserId && currentUserRankSection) {
                             currentUserRankSection.style.display = 'none';
                        }
                    }
                }


                // --- Display Leaderboard Table Data ---
                if (leaderboardEntries.length > 0) {
                    if(leaderboardTable) leaderboardTable.style.display = 'table';
                    if(leaderboardTbody) leaderboardTbody.innerHTML = ''; // Clear previous entries

                    leaderboardEntries.forEach(entry => {
                        const row = leaderboardTbody.insertRow();
                        
                        // Highlight the current user's row if it's in the list
                        if (currentUserId !== null && entry.user_id === currentUserId) {
                            row.classList.add('current-user-row');
                        }

                        const rankCell = row.insertCell();
                        rankCell.textContent = entry.rank.toLocaleString(); // Format rank number
                        rankCell.classList.add('rank-cell');

                        const usernameCell = row.insertCell();
                        usernameCell.textContent = escapeHtml(entry.username);

                        const pointsCell = row.insertCell();
                        pointsCell.textContent = entry.points.toLocaleString(); // Format points number
                        pointsCell.classList.add('points-cell');
                         pointsCell.style.textAlign = 'right'; // Ensure right alignment if CSS class isn't enough
                    });

                    // --- Update Pagination Controls ---
                    if(paginationControls) paginationControls.style.display = 'flex';
                    updatePaginationControlsState();

                } else {
                    // No entries in the snapshot
                    if(noDataMessage) noDataMessage.style.display = 'block';
                    if(paginationControls) paginationControls.style.display = 'none'; // Hide pagination if no data
                    totalPages = 0; // Reset total pages if no data
                    updatePaginationControlsState(); // Ensure buttons are disabled
                }

            } else {
                // API returned success=false
                console.error("Leaderboard API returned success: false", result.errors);
                if(errorMessage) {
                    errorMessage.textContent = result.errors?.general || 'Failed to load leaderboard data due to API error.';
                    errorMessage.style.display = 'block';
                } else {
                    alert('Failed to load leaderboard data: ' + (result.errors?.general || 'Unknown error')); // Fallback alert
                }
                 if(paginationControls) paginationControls.style.display = 'none';
                 totalPages = 0;
                 updatePaginationControlsState();
            }

        } catch (error) {
            // Network or parsing error
            console.error('Error fetching leaderboard:', error);
             if(errorMessage) {
                errorMessage.textContent = `An unexpected error occurred: ${escapeHtml(error.message || String(error))}`;
                errorMessage.style.display = 'block';
            } else {
                 alert(`An unexpected error occurred while fetching leaderboard: ${error.message || String(error)}`); // Fallback alert
            }
            if(noDataMessage) noDataMessage.style.display = 'none'; // Hide no data message if error occurred
            if(paginationControls) paginationControls.style.display = 'none';
            totalPages = 0;
            updatePaginationControlsState();

        } finally {
             // --- Hide Loading State ---
             if(loadingMessage) loadingMessage.style.display = 'none';
             // Other elements (table, noDataMessage, errorMessage, paginationControls, currentUserRankSection)
             // are displayed/hidden within the try/catch blocks based on success/failure.
        }
    }

    // --- Function to Update Pagination Button States ---
    function updatePaginationControlsState() {
        if (!pageInfoEl || !prevPageBtn || !nextPageBtn) return;

        pageInfoEl.textContent = `Page ${currentPage} of ${totalPages}`;
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;

        if (totalPages <= 1) { // Hide pagination if only one page
            if(paginationControls) paginationControls.style.display = 'none';
        } else {
             if(paginationControls) paginationControls.style.display = 'flex';
        }
    }

    // --- Event Listeners for Pagination ---
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                fetchLeaderboard(currentPage - 1);
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                fetchLeaderboard(currentPage + 1);
            }
        });
    }

    // --- Event Listener for Optional Admin Populate Button ---
    // if (populateLeaderboardBtn) {
    //     populateLeaderboardBtn.addEventListener('click', async () => {
    //         const isConfirmed = confirm("Are you sure you want to repopulate the leaderboard snapshot? This might take a moment.");
    //         if (!isConfirmed) return;

    //         populateLeaderboardBtn.disabled = true;
    //         const originalHtml = populateLeaderboardBtn.innerHTML;
    //         populateLeaderboardBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

    //         try {
    //             const response = await fetch('/api/admin/populate-leaderboard', { method: 'POST' });
    //             const result = await response.json();
    //             if (response.ok && result.success) {
    //                 alert(result.message || 'Leaderboard updated successfully!');
    //                 fetchLeaderboard(1); // Refresh the first page of the leaderboard
    //             } else {
    //                 console.error("Admin populate failed:", result);
    //                 alert('Failed to update leaderboard: ' + (result.errors?.general || result.message || 'Unknown error'));
    //             }
    //         } catch (error) {
    //             console.error("Admin populate network error:", error);
    //             alert('An error occurred while sending update request.');
    //         } finally {
    //             populateLeaderboardBtn.disabled = false;
    //             populateLeaderboardBtn.innerHTML = originalHtml;
    //         }
    //     });
    // }


    // --- Initial Load ---
    fetchLeaderboard();
});