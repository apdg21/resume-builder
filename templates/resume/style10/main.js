document.addEventListener('DOMContentLoaded', () => {
    // Hamburger menu functionality
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('nav-links');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
        });

        // Close menu when a nav link is clicked
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (hamburger.classList.contains('active')) {
                    hamburger.classList.remove('active');
                    navLinks.classList.remove('active');
                }
            });
        });
    } else {
        console.error('Hamburger or nav links not found:', { hamburger, navLinks });
    }

    // Function to check if we're running locally (localhost, 127.0.0.1, or file://)
    function isLocalHost() {
        return (
            window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.protocol === "file:"
        );
    }

    let fileSelectBtn; // Declared in a higher scope so it's accessible globally
    let createLinkContainer; // Declared in a higher scope to manage its visibility

    // --- Local Development: File Selector Setup ---
    // This section creates a button to load local JSON files,
    // visible only when running the site locally.
    if (isLocalHost()) {
        console.log('Running locally, setting up file selector.');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none'; // Keep input hidden
        document.body.appendChild(fileInput);

        fileSelectBtn = document.createElement('button');
        fileSelectBtn.textContent = 'Load Resume Data';
        fileSelectBtn.className = 'file-select-btn'; // Apply custom styling
        const fileIcon = document.createElement('i');
        fileIcon.className = 'fas fa-upload'; // Font Awesome upload icon
        fileSelectBtn.prepend(fileIcon); // Add icon before text

        fileSelectBtn.addEventListener('click', () => {
            console.log('Load button clicked.');
            fileInput.click(); // Trigger the hidden file input
        });

        // Add the load button to the header
        const header = document.querySelector('header .header-content');
        if (header) {
            const navElement = header.querySelector('nav');

            // Create the "Create one first" link with specified styles
            createLinkContainer = document.createElement('p');
            createLinkContainer.style.marginTop = '1rem';
            createLinkContainer.style.fontSize = '0.9rem';
            createLinkContainer.textContent = "Don't have a file? ";
            const createLink = document.createElement('a');
            createLink.href = 'form.html';
            createLink.textContent = 'Create one first';
            createLinkContainer.appendChild(createLink);

            // Insert before nav if nav exists, otherwise append
            if (navElement) {
                header.insertBefore(fileSelectBtn, navElement);
                header.insertBefore(createLinkContainer, navElement); // Insert the new link before nav
            } else {
                header.appendChild(fileSelectBtn);
                header.appendChild(createLinkContainer); // Append the new link
            }
            console.log('File selector button and create file link added to header.');
        } else {
            console.error('Header content not found for adding file selector button.');
        }

        // Handle file selection from the local input
        fileInput.addEventListener('change', (event) => {
            console.log('File input changed.');
            const file = event.target.files[0];
            if (!file) return; // No file selected

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    console.log('File loaded, attempting to parse JSON...');
                    const data = JSON.parse(e.target.result);
                    populateResume(data); // Populate the resume display
                    if (fileSelectBtn) {
                        fileSelectBtn.style.display = 'none'; // Hide button after successful load
                        if (createLinkContainer) {
                            createLinkContainer.style.display = 'none'; // Also hide the "Create one first" link
                        }
                        console.log('File selector button and create file link hidden after loading.');
                    }
                    fileInput.value = ''; // Reset file input to allow re-selection of same file
                } catch (error) {
                    console.error('Error parsing JSON file:', error);
                    alert('Invalid JSON file. Please select a valid resume data file.');
                }
            };
            reader.readAsText(file); // Read the file as text
        });
    }

    // --- Default Data Loading ---
    // Attempt to load data.json when the page first loads.
    // This serves as a default template or pre-filled example.
    console.log('Attempting to load data.json...');
    loadResumeData('data.json');

    // Function to fetch and load resume data from a URL (e.g., data.json)
    function loadResumeData(url) {
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    // Throw an error if the HTTP response status is not OK (e.g., 404)
                    throw new Error(`HTTP error! Status: ${response.status} for ${url}`);
                }
                return response.json(); // Parse the JSON data
            })
            .then(data => {
                console.log('Data loaded successfully from ' + url + ':', data);
                populateResume(data); // Populate the resume display with fetched data
                if (fileSelectBtn) {
                    fileSelectBtn.style.display = 'none'; // Hide the local file button if default loaded
                    if (createLinkContainer) {
                        createLinkContainer.style.display = 'none'; // Hide the "Create one first" link
                    }
                    console.log('File selector button and create file link hidden after default data load.');
                }
            })
            .catch(error => {
                console.error('Error loading resume data from ' + url + ':', error);
                // If on localhost and loading failed, show the file selector button
                if (isLocalHost() && fileSelectBtn) {
                    alert('Failed to load ' + url + '. If running locally, you can load a custom file using the button.');
                    fileSelectBtn.style.display = 'inline-flex'; // Show local file button
                    if (createLinkContainer) {
                        createLinkContainer.style.display = 'block'; // Show the "Create one first" link
                    }
                    console.log('File selector button and create file link shown due to fetch error.');
                }
            });
    }

    // --- Data Structure for Form/Save (used in save logic) ---
    // This defines the expected structure of array-based sections for data collection.
    // It's crucial for the "Save JSON" functionality to correctly parse dynamic fields.
    const arrayFields = {
        experience: [
            { name: 'position', label: 'Position', placeholder: 'Enter position' },
            { name: 'company', label: 'Company', placeholder: 'Enter company' },
            { name: 'date', label: 'Date', placeholder: 'Enter date' },
            { name: 'description', label: 'Description', placeholder: 'Enter description', type: 'textarea' }
        ],
        education: [
            { name: 'degree', label: 'Degree', placeholder: 'Enter degree' },
            { name: 'institution', label: 'Institution', placeholder: 'Enter institution' },
            { name: 'date', label: 'Date', placeholder: 'Enter date' }
        ],
        skills: [
            { name: 'skill', label: 'Skill', placeholder: 'Enter skill' }
        ],
        languages: [
            { name: 'language', label: 'Language', placeholder: 'Enter language' }
        ],
        references: [
            { name: 'name', label: 'Name', placeholder: 'Enter name' },
            { name: 'position', label: 'Position', placeholder: 'Enter position' },
            { name: 'company', label: 'Company', placeholder: 'Enter company' },
            { name: 'contact', label: 'Contact', placeholder: 'Enter contact' }
        ]
    };

    // --- Resume Display Population ---
    // This function takes JSON data and updates the content of the HTML elements
    // that display the resume information.
    function populateResume(data) {
        console.log('Populating resume display with data:', data);
        try {
            // General Document Title
            const pageTitle = document.getElementById('page-title');
            if (pageTitle) pageTitle.textContent = data.title || 'Editable Resume';
            else console.warn("Element with ID 'page-title' not found.");


            // Header Title
            const headerTitle = document.getElementById('header-title');
            if (headerTitle) headerTitle.textContent = data.header?.title || '';
            else console.warn("Element with ID 'header-title' not found.");

            // Profile Section
            const profileName = document.getElementById('profile-name-display');
            const profileTitle = document.getElementById('profile-title-display');
            const profilePhoto = document.getElementById('profile-photo-display');

            if (profileName) profileName.textContent = data.profile?.name || '';
            else console.warn("Element with ID 'profile-name-display' not found.");

            if (profileTitle) profileTitle.textContent = data.profile?.title || '';
            else console.warn("Element with ID 'profile-title-display' not found.");

            if (profilePhoto) profilePhoto.src = data.profile?.photo || 'assets/profile.jpg';
            else console.warn("Element with ID 'profile-photo-display' not found.");


            // --- About Section ---
            const aboutTextDisplay = document.getElementById('about-text-display');
            if (aboutTextDisplay) {
                aboutTextDisplay.textContent = data.about || ''; // Correctly targets 'data.about'
                console.log('About text set to:', data.about);
            } else {
                console.error("About text display element not found with ID 'about-text-display'");
            }


            // Experience Section
            const expList = document.getElementById('experience-list');
            if (expList) {
                expList.innerHTML = ''; // Clear previous entries
                if (data.experience && Array.isArray(data.experience)) {
                    data.experience.forEach(exp => {
                        const div = document.createElement('div');
                        div.className = 'experience-item';
                        div.innerHTML = `
                            <h3>${exp.position || ''}</h3>
                            <p>${exp.company || ''} | ${exp.date || ''}</p>
                            <p>${exp.description || ''}</p>
                        `;
                        expList.appendChild(div);
                    });
                }
            } else {
                console.error("Experience list element not found with ID 'experience-list'");
            }

            // Education Section
            const eduList = document.getElementById('education-list');
            if (eduList) {
                eduList.innerHTML = ''; // Clear previous entries
                if (data.education && Array.isArray(data.education)) {
                    data.education.forEach(edu => {
                        const div = document.createElement('div');
                        div.className = 'education-item';
                        div.innerHTML = `
                            <h3>${edu.degree || ''}</h3>
                            <p>${edu.institution || ''} | ${edu.date || ''}</p>
                        `;
                        eduList.appendChild(div);
                    });
                }
            } else {
                console.error("Education list element not found with ID 'education-list'");
            }

            // Skills Section
            const skillsList = document.getElementById('skills-list');
            if (skillsList) {
                skillsList.innerHTML = ''; // Clear previous entries
                if (data.skills && Array.isArray(data.skills)) {
                    data.skills.forEach(skill => {
                        const li = document.createElement('li');
                        li.textContent = skill || '';
                        skillsList.appendChild(li);
                    });
                }
            } else {
                console.error("Skills list element not found with ID 'skills-list'");
            }

            // Languages Section
            const langList = document.getElementById('languages-list');
            if (langList) {
                langList.innerHTML = ''; // Clear previous entries
                if (data.languages && Array.isArray(data.languages)) {
                    data.languages.forEach(lang => {
                        const li = document.createElement('li');
                        li.textContent = lang || '';
                        langList.appendChild(li);
                    });
                }
            } else {
                console.error("Languages list element not found with ID 'languages-list'");
            }

            // References Section
            const refList = document.getElementById('references-list');
            if (refList) {
                refList.innerHTML = ''; // Clear previous entries
                if (data.references && Array.isArray(data.references)) {
                    data.references.forEach(ref => {
                        const div = document.createElement('div');
                        div.className = 'reference-item';
                        div.innerHTML = `
                            <h3>${ref.name || ''}</h3>
                            <p>${ref.position || ''} | ${ref.company || ''}</p>
                            <p>${ref.contact || ''}</p>
                        `;
                        refList.appendChild(div);
                    });
                }
            } else {
                console.error("References list element not found with ID 'references-list'");
            }

            // Contact Information
            const contactInfo = document.getElementById('contact-info');
            if (contactInfo) {
                contactInfo.innerHTML = ''; // Clear previous info
                if (data.contact && typeof data.contact === 'object') {
                    if (data.contact.Email) {
                        const emailP = document.createElement('p');
                        emailP.innerHTML = `<i class="fas fa-envelope"></i> ${data.contact.Email}`;
                        contactInfo.appendChild(emailP);
                    }
                    if (data.contact.Phone) {
                        const phoneP = document.createElement('p');
                        phoneP.innerHTML = `<i class="fas fa-phone"></i> ${data.contact.Phone}`;
                        contactInfo.appendChild(phoneP);
                    }
                }
            } else {
                console.error("Contact info element not found with ID 'contact-info'");
            }

            // --- Social Media Links in Footer (Dynamic Display) ---
            const socialsDiv = document.getElementById('social-icons');
            if (socialsDiv) {
                socialsDiv.innerHTML = ''; // Clear existing icons

                // Define mappings for social platforms: icon class and URL prefix
                // Ensure this map includes all social platforms you want to display from data.json
                const socialMediaMap = {
                    LinkedIn: { icon: 'fab fa-linkedin', prefix: 'https://' },
                    GitHub: { icon: 'fab fa-github', prefix: 'https://' },
                    Facebook: { icon: 'fab fa-facebook-f', prefix: 'https://facebook.com/' }, // Added Facebook
                    Twitter: { icon: 'fab fa-twitter', prefix: 'https://twitter.com/' },
                    Instagram: { icon: 'fab fa-instagram', prefix: 'https://instagram.com/' },
                    Website: { icon: 'fas fa-globe', prefix: 'https://' },
                    // Add more social media platforms here as needed, matching the key in data.json
                    // 'YouTube': { icon: 'fab fa-youtube', prefix: 'https://youtube.com/' },
                    // 'StackOverflow': { icon: 'fab fa-stack-overflow', prefix: 'https://stackoverflow.com/users/' }
                };

                if (data.socials && typeof data.socials === 'object') {
                    for (const platform in data.socials) {
                        // Ensure it's a direct property of socials and has a non-empty value
                        if (data.socials.hasOwnProperty(platform) && data.socials[platform]) {
                            const socialInfo = socialMediaMap[platform]; // Get mapping info

                            if (socialInfo) { // If a mapping exists for this platform
                                const a = document.createElement('a');
                                let url = data.socials[platform];

                                // Prepend prefix if URL doesn't already have http/https
                                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                                    url = socialInfo.prefix + url;
                                }

                                a.href = url;
                                a.innerHTML = `<i class="${socialInfo.icon}"></i>`;
                                a.setAttribute('target', '_blank'); // Open in new tab
                                a.setAttribute('rel', 'noopener noreferrer'); // Security best practice
                                socialsDiv.appendChild(a);
                            } else {
                                console.warn(`No icon mapping found for social platform: "${platform}". It will not be displayed.`);
                            }
                        }
                    }
                }
            } else {
                console.error("Social icons element not found with ID 'social-icons'");
            }

            // Footer Text
            const footerText = document.getElementById('footer-text');
            if (footerText) footerText.textContent = data.footer || '';
            else console.warn("Footer text element not found with ID 'footer-text'");

        } catch (error) {
            console.error('Error populating resume display:', error);
            alert('Failed to populate resume data for display. Please check the console.');
        }
    }

    // --- Save JSON Button Functionality ---
    // This section collects data from the HTML elements currently displaying the resume
    // and compiles it into a JSON object, then triggers a download of that JSON as 'data.json'.
    document.getElementById('save-json').addEventListener('click', () => {
        console.log('Save JSON button clicked.');
        try {
            // Collect data directly from display elements using their textContent or src
            const data = {
                title: document.getElementById('page-title')?.textContent || '',
                header: { title: document.getElementById('header-title')?.textContent || '' },
                profile: {
                    name: document.getElementById('profile-name-display')?.textContent || '',
                    title: document.getElementById('profile-title-display')?.textContent || '',
                    photo: document.getElementById('profile-photo-display')?.src || 'assets/profile.jpg'
                },
                socials: {}, // Populated dynamically below from display
                about: document.getElementById('about-text-display')?.textContent || '',
                experience: [], // Populated dynamically below from display
                education: [], // Populated dynamically below from display
                skills: [], // Populated dynamically below from display
                languages: [], // Populated dynamically below from display
                references: [], // Populated dynamically below from display
                contact: {
                    Email: '', // These are harder to extract from display without explicit elements
                    Phone: ''  // You might need dedicated display elements for these to save them
                },
                footer: document.getElementById('footer-text')?.textContent || ''
            };

            // Collect Socials from the displayed links in 'social-icons' div
            const socialsDiv = document.getElementById('social-icons');
            if (socialsDiv) {
                const socialLinks = socialsDiv.querySelectorAll('a');
                // Define a reverse map for saving, mapping icon class to platform name
                const reverseSocialMediaMap = {
                    'fab fa-linkedin': 'LinkedIn',
                    'fab fa-github': 'GitHub',
                    'fab fa-facebook-f': 'Facebook', // Added Facebook for saving
                    'fab fa-twitter': 'Twitter',
                    'fab fa-instagram': 'Instagram',
                    'fas fa-globe': 'Website'
                    // Add more reverse mappings here
                };

                socialLinks.forEach(link => {
                    const iconElement = link.querySelector('i');
                    if (iconElement) {
                        const iconClass = iconElement.className;
                        const platformName = reverseSocialMediaMap[iconClass];

                        if (platformName) {
                            let handle = link.href.replace(/(https?:\/\/)?(www\.)?/i, ''); // Remove http(s):// and www.
                            // Specific handling for common social platforms to get just the handle/path
                            if (platformName === 'Twitter' && handle.startsWith('twitter.com/')) handle = handle.substring('twitter.com/'.length);
                            else if (platformName === 'Instagram' && handle.startsWith('instagram.com/')) handle = handle.substring('instagram.com/'.length);
                            else if (platformName === 'Facebook' && handle.startsWith('facebook.com/')) handle = handle.substring('facebook.com/'.length);
                            else if (platformName === 'LinkedIn' && handle.startsWith('linkedin.com/in/')) handle = handle.substring('linkedin.com/in/'.length);
                            else if (platformName === 'GitHub' && handle.startsWith('github.com/')) handle = handle.substring('github.com/'.length);

                            data.socials[platformName] = handle;
                        } else {
                            console.warn(`Save JSON: Could not reverse map icon class "${iconClass}" to a platform name.`);
                        }
                    }
                });
            }


            // Collect array data (Experience, Education, Skills, Languages, References)
            // This part assumes your HTML for the *editing form* (if separate) or content-editable
            // divs has the correct structure for inputs with 'name' attributes.
            // If you are relying purely on the *display* lists (e.g., 'experience-list')
            // for saving, this will need a more complex parsing of the generated HTML.
            // For now, it keeps the logic to read from hypothetical '*-entries' containers
            // which would hold actual input fields. If you don't have these, this part
            // of the save will gather empty arrays.
            Object.keys(arrayFields).forEach(sectionId => {
                const entriesContainer = document.getElementById(`${sectionId}-entries`); // This would be the container in an editing form
                if (entriesContainer) {
                    const entries = entriesContainer.children;
                    const entryData = [];
                    for (let i = 0; i < entries.length; i++) {
                        const entry = {};
                        let hasData = false;
                        arrayFields[sectionId].forEach(field => {
                            const inputElement = entries[i].querySelector(`[name="${sectionId}\\[${i}\\]\\.${field.name}"]`);
                            if (inputElement && inputElement.value) {
                                entry[field.name] = inputElement.value;
                                hasData = true;
                            }
                        });
                        if (hasData) {
                            if (sectionId === 'skills') {
                                if (entry.skill) entryData.push(entry.skill);
                            } else if (sectionId === 'languages') {
                                if (entry.language) entryData.push(entry.language);
                            } else {
                                entryData.push(entry);
                            }
                        }
                    }
                    data[sectionId] = entryData;
                } else {
                    console.warn(`Save JSON: Editing form container "${sectionId}-entries" not found. No editable data collected for this section.`);
                }
            });

            // Collect contact info from display elements if available
            // This is a basic attempt; more robust saving would require specific editable inputs.
            const contactInfoElement = document.getElementById('contact-info');
            if (contactInfoElement) {
                const emailP = contactInfoElement.querySelector('p i.fa-envelope'); // Select <i> inside a <p>
                if (emailP) {
                    // Get parent <p> and then its text content, removing the icon's text
                    const emailText = emailP.parentNode.textContent.replace(emailP.textContent, '').trim();
                    data.contact.Email = emailText;
                }
                const phoneP = contactInfoElement.querySelector('p i.fa-phone');
                if (phoneP) {
                    const phoneText = phoneP.parentNode.textContent.replace(phoneP.textContent, '').trim();
                    data.contact.Phone = phoneText;
                }
            }


            console.log('Collected data for saving:', data);

            // Trigger JSON file download
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'data.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('JSON file download triggered.');
            alert('Resume data saved as data.json');
        } catch (error) {
            console.error('Error saving JSON:', error);
            alert('Failed to save JSON file. Please check the console for errors and try again.');
        }
    });

    // Smooth scrolling for anchor links (e.g., in navigation)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});