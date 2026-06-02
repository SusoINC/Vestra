from flask import Blueprint

bp = Blueprint("vehicle", __name__)

from . import routes  # noqa: E402, F401
