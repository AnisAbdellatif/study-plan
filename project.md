This project is going to be a web platform. It's main purpose is to help students organize their study plans (which subject/module in which semester) and also track their performance (grades). This is going to follow the german university system. A B.Sc would usually be 6 semesters long, and a M.Sc would usually be 4 semesters long. The platform would host some predefined presets for some plans (for example Informatik and Technische Informatik). These would be hosted on the platform, maybe in json format, or whatever format is most suitable for this project. The platform would also allow students to create their own study plans, and share them with other students. The platform would also allow students to track their performance by entering their grades for each module, and the platform would calculate their average (Durschnittsnote) based on the grades entered. The platform would also provide some statistics and visualizations of the student's performance over time.
These are some of the core features:
- Auth entication and user management (sign up, log in, password reset)
- Study plan creation and management (add/remove modules, assign modules to semesters). It should also support drag and drop functionality for easy reordering of modules within semesters.
- Predefined study plan presets for popular courses (e.g., Informatik, Technische Informatik)
- Grade tracking and performance calculation (Durschnittsnote)
- Statistics and visualizations of performance over time (e.g., line charts, bar charts)
- Sharing of study plans with other students (public/private sharing options)
- Responsive design for accessibility on various devices (desktop, tablet, mobile)
- Notifications and reminders for upcoming exams or deadlines
- It should implement the most recent web technologies and best practices for security, performance, and user experience. This should include using an appropriate frontend framework (React or Vue, with tailwind css maybe), a backend framework (maybe a js/ts backend powered by bun), and a database (PostgreSQL maybe). The platform should also be easily deployable and maintainable (maybe use docker).
- Implement tests and CI/CD pipelines.
