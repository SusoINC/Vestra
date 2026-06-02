from flask import Flask


def register_blueprints(app: Flask) -> None:
    from .auth import bp as auth_bp
    from .finance import bp as finance_bp
    from .investment import bp as investment_bp
    from .vehicle import bp as vehicle_bp
    from .project import bp as project_bp

    app.register_blueprint(auth_bp, url_prefix="/api/v1/auth")
    app.register_blueprint(finance_bp, url_prefix="/api/v1/finance")
    app.register_blueprint(investment_bp, url_prefix="/api/v1/investments")
    app.register_blueprint(vehicle_bp, url_prefix="/api/v1/vehicles")
    app.register_blueprint(project_bp, url_prefix="/api/v1/projects")
