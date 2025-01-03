import banner from '../assets/banner.png';
import "./Dashboard.css"

function Dashboard() {
  return (
    <div>

      <section className="header-image">
        <img src={banner} alt="EduArchive Main Header"></img>
      </section>

      <main className="content">
        <section className="topics">
          <div className="search-container">
            <input type="text" id="topic-search" placeholder="Search topics..." />
            <button type="submit" className="search-button">
              <i className="fas fa-search"></i>
            </button>
          </div>

          <div className="topic-list">
            <div className="topic-item" id="science">
              <i className="fas fa-flask"></i>
              <p>Science</p>
            </div>
            <div className="topic-item" id="technology">
              <i className="fas fa-cogs"></i>
              <p>Technology</p>
            </div>
            <div className="topic-item" id="engineering">
              <i className="fas fa-tools"></i>
              <p>Engineering</p>
            </div>
            <div className="topic-item" id="mathematics">
              <i className="fas fa-square-root-alt"></i>
              <p>Mathematics</p>
            </div>
            <div className="topic-item" id="medicine">
              <i className="fas fa-heartbeat"></i>
              <p>Medicine</p>
            </div>
            <div className="topic-item" id="education">
              <i className="fas fa-graduation-cap"></i>
              <p>Education</p>
            </div>
            <div className="topic-item" id="health">
              <i className="fas fa-user-md"></i>
              <p>Health</p>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}

export default Dashboard;
