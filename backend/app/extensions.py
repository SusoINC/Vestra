from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from apscheduler.schedulers.background import BackgroundScheduler

db = SQLAlchemy()
jwt = JWTManager()
migrate = Migrate()
scheduler = BackgroundScheduler(timezone="Europe/Madrid")
