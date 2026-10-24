import os
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class Settings:
    token: str
    group_secret: str
    neo4j_password: str
    neo4j_uri: str = 'bolt://127.0.0.1:7687'
    neo4j_user: str = 'neo4j'
    ollama_url: str = 'http://127.0.0.1:11434/v1'
    model: str = 'llama3.2:latest'
    embed_model: str = 'nomic-embed-text'
    embed_dim: int = 768
    ingest_timeout: float = 240
    read_timeout: float = 12
    queue_size: int = 16

    def __post_init__(self):
        if len(self.token) < 32 or len(self.group_secret) < 32:
            raise ValueError('Set independent GRAPHITI_SERVICE_TOKEN and GRAPHITI_GROUP_SECRET (32+ characters)')
        if self.token == self.group_secret:
            raise ValueError('Service token and group secret must differ')
        if not self.neo4j_password:
            raise ValueError('NEO4J_PASSWORD is required')
        url = urlparse(self.ollama_url)
        if (url.scheme != 'http' or url.hostname not in {'127.0.0.1', 'localhost', '::1'}
                or url.path.rstrip('/') != '/v1' or url.username or url.password or url.query or url.fragment):
            raise ValueError('OLLAMA_BASE_URL must be a loopback http://.../v1 endpoint')

    @classmethod
    def from_env(cls):
        return cls(
            token=os.environ.get('GRAPHITI_SERVICE_TOKEN', ''),
            group_secret=os.environ.get('GRAPHITI_GROUP_SECRET', ''),
            neo4j_password=os.environ.get('NEO4J_PASSWORD', ''),
            neo4j_uri=os.environ.get('NEO4J_URI', 'bolt://127.0.0.1:7687'),
            neo4j_user=os.environ.get('NEO4J_USER', 'neo4j'),
            ollama_url=os.environ.get('OLLAMA_BASE_URL', 'http://127.0.0.1:11434/v1'),
            model=os.environ.get('OLLAMA_MODEL', 'llama3.2:latest'),
            embed_model=os.environ.get('OLLAMA_EMBED_MODEL', 'nomic-embed-text'),
            embed_dim=int(os.environ.get('OLLAMA_EMBED_DIM', '768')),
        )

