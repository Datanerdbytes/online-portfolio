from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DATABASE_URL: str = "postgresql+psycopg://resume:resume@localhost:5432/resume"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
