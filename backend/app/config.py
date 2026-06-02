from __future__ import annotations

import os
from datetime import timedelta


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-in-prod")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 3600,
    }

    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret-change-in-prod")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        seconds=int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES", 900))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        seconds=int(os.environ.get("JWT_REFRESH_TOKEN_EXPIRES", 2592000))
    )
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_TYPE = "Bearer"

    SCHEDULER_API_ENABLED = os.environ.get("SCHEDULER_API_ENABLED", "false").lower() == "true"

    NORDIGEN_SECRET_ID = os.environ.get("NORDIGEN_SECRET_ID", "")
    NORDIGEN_SECRET_KEY = os.environ.get("NORDIGEN_SECRET_KEY", "")
    NORDIGEN_BASE_URL = os.environ.get(
        "NORDIGEN_BASE_URL", "https://bankaccountdata.gocardless.com/api/v2"
    )


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "postgresql://vestra:password@localhost:5432/vestra"
    )
    SQLALCHEMY_ECHO = False


class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")


config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
