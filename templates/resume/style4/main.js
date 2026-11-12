document.addEventListener('DOMContentLoaded', async () => {
    // Initialize hamburger menu functionality
    function setupHamburgerMenu() {
        const hamburger = document.querySelector('.hamburger');
        const navMenu = document.querySelector('.nav-menu');
        
        if (hamburger && navMenu) {
            hamburger.addEventListener('click', () => {
                hamburger.classList.toggle('active');
                navMenu.classList.toggle('active');
            });

            // Close menu when clicking on a nav link
            document.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', () => {
                    hamburger.classList.remove('active');
                    navMenu.classList.remove('active');
                });
            });
        }
    }

    async function loadDataFromJson(data) {
        // Update page title
        document.getElementById('page-title').textContent = data.title;

        // Update profile card (using single source for name and title)
        document.getElementById('profile-name').textContent = data.profile.name;
        document.getElementById('profile-title').textContent = data.hero.title;
        document.getElementById('profile-img').src = data.profile.image;
        const profileSocialLinks = document.getElementById('profile-social-links');
        profileSocialLinks.innerHTML = data.profile.social_links.map(link => 
            `<a href="${link.url}" target="_blank"><i class="${link.icon}"></i></a>`
        ).join('');

        // Update hero section
        document.getElementById('hero-name').textContent = data.profile.name;
        document.getElementById('hero-title').textContent = data.hero.title;
        document.getElementById('hero-description').textContent = data.hero.description;
        document.getElementById('hero-image').src = data.hero.image;

        // Update about section
        document.getElementById('about-description').innerHTML = data.about.description.map(p => `<p>${p}</p>`).join('');
        document.getElementById('info-name').textContent = data.profile.name;
        document.getElementById('info-email').textContent = data.about.personal_info.email;
        document.getElementById('info-location').textContent = data.about.personal_info.location;
        document.getElementById('info-availability').textContent = data.about.personal_info.availability;
        
        const aboutStats = document.getElementById('about-stats');
        aboutStats.innerHTML = data.about.stats.map(stat => `
            <div class="stat-item">
                <h3>${stat.value}</h3>
                <p>${stat.label}</p>
            </div>
        `).join('');

        // Update experience section
        const experienceTimeline = document.getElementById('experience-timeline');
        experienceTimeline.innerHTML = data.experience.map(exp => `
            <div class="timeline-item">
                <div class="timeline-date">${exp.date}</div>
                <div class="timeline-content">
                    <h3>${exp.title}</h3>
                    <h4>${exp.company}</h4>
                    <ul>
                        ${exp.responsibilities.map(resp => `<li>${resp}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `).join('');

        // Update skills section
        const skillsContainer = document.getElementById('skills-container');
        skillsContainer.innerHTML = data.skills.map(category => `
            <div class="skill-category">
                <h3>${category.category}</h3>
                ${category.items.map(item => `
                    <div class="skill-item">
                        <p>${item.name}</p>
                        <div class="skill-bar">
                            <div class="skill-progress" style="width: ${item.progress}%"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `).join('');

        // Update education section
        const educationContainer = document.getElementById('education-container');
        educationContainer.innerHTML = data.education.map(edu => `
            <div class="education-item">
                <div class="education-date">${edu.date}</div>
                <div class="education-content">
                    <h3>${edu.title}</h3>
                    <h4>${edu.institution}</h4>
                    <p>${edu.description}</p>
                </div>
            </div>
        `).join('');

        // Update awards section
        const awardsContainer = document.getElementById('awards-container');
        awardsContainer.innerHTML = data.awards.map(award => `
            <div class="award-item">
                <div class="award-date">${award.date}</div>
                <div class="award-content">
                    <h3>${award.title}</h3>
                    <h4>${award.institution}</h4>
                    <p>${award.description}</p>
                </div>
            </div>
        `).join('');

        // Update contact section
        document.getElementById('contact-email').textContent = data.contact.email;
        document.getElementById('contact-phone').textContent = data.contact.phone;
        document.getElementById('contact-location').textContent = data.contact.location;

        // Update footer
        document.getElementById('footer-name').textContent = data.profile.name;
        document.getElementById('footer-title').textContent = data.hero.title;
        document.getElementById('footer-copyright').textContent = data.footer.copyright.replace('{year}', new Date().getFullYear());
        
        const footerSocialLinks = document.getElementById('footer-social-links');
        footerSocialLinks.innerHTML = data.profile.social_links.map(link => 
            `<a href="${link.url}" target="_blank"><i class="${link.icon}"></i></a>`
        ).join('');

        // Setup hamburger menu after loading content
        setupHamburgerMenu();
    }

    try {
    // Check if running locally (file:// protocol)
    if (window.location.protocol === 'file:') {
        // Create a visible button for file selection
        const fileSelectContainer = document.createElement('div');
        fileSelectContainer.style.position = 'fixed';
        fileSelectContainer.style.top = '20px';
        fileSelectContainer.style.left = '400px';
        fileSelectContainer.style.zIndex = '1000';
        fileSelectContainer.style.backgroundColor = '#fff';
        fileSelectContainer.style.padding = '10px';
        fileSelectContainer.style.border = '1px solid #ccc'; // Fixed typo: 'brder' to 'border'
        fileSelectContainer.style.borderRadius = '5px';
        fileSelectContainer.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';

        const selectButton = document.createElement('button');
        selectButton.textContent = 'Select data.json';
        selectButton.style.padding = '8px 16px';
        selectButton.style.backgroundColor = '#007bff';
        selectButton.style.color = '#fff';
        selectButton.style.border = 'none';
        selectButton.style.borderRadius = '3px';
        selectButton.style.cursor = 'pointer';

        // Create paragraph with link
        const helpText = document.createElement('p');
        helpText.style.marginTop = '1rem';
        helpText.style.fontSize = '0.9rem';
        helpText.innerHTML = 'Don\'t have a file? <a href="form.html">Create one first</a>';

        fileSelectContainer.appendChild(selectButton);
        fileSelectContainer.appendChild(fileInput);
        fileSelectContainer.appendChild(helpText);
        document.body.appendChild(fileSelectContainer);

            // Handle button click to trigger file input
            selectButton.addEventListener('click', () => {
                fileInput.click();
            });

            // Handle file selection
            fileInput.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        try {
                            const data = JSON.parse(e.target.result);
                            await loadDataFromJson(data);
                            // Hide the file select button after successful load
                            fileSelectContainer.style.display = 'none';
                        } catch (error) {
                            console.error('Error parsing JSON file:', error);
                            alert('Failed to parse data.json. Please ensure it is a valid JSON file.');
                        }
                    };
                    reader.readAsText(file);
                }
            });
        } else {
            // Running on a server, fetch data.json from same directory
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            await loadDataFromJson(data);
        }
    } catch (error) {
        console.error('Error loading data:', error);
        if (window.location.protocol !== 'file:') {
            alert('Failed to load data.json. Please ensure the file is available in the same directory.');
        }
    }
});