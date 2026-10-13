from __future__ import annotations

import sys
import types

import pytest

from app.config import Settings
from app.storage import S3PrivateStorage


class FakeConfig:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class FakeS3NotFound(Exception):
    def __init__(self):
        self.response = {
            "Error": {"Code": "NoSuchKey"},
            "ResponseMetadata": {"HTTPStatusCode": 404},
        }
        super().__init__("provider detail must not escape storage abstraction")


class FakeS3Client:
    def __init__(self):
        self.put_calls: list[dict] = []
        self.objects: dict[tuple[str, str], bytes] = {}

    def put_object(self, **kwargs):
        self.put_calls.append(kwargs)
        self.objects[(kwargs["Bucket"], kwargs["Key"])] = kwargs["Body"]

    def get_object(self, **kwargs):
        key = (kwargs["Bucket"], kwargs["Key"])
        if key not in self.objects:
            raise FakeS3NotFound()
        return {"Body": types.SimpleNamespace(read=lambda: self.objects[key])}

    def delete_object(self, **kwargs):
        self.objects.pop((kwargs["Bucket"], kwargs["Key"]), None)


def install_fake_boto(monkeypatch):
    captured: dict[str, object] = {}
    fake_client = FakeS3Client()

    def client(service_name: str, **kwargs):
        captured["service_name"] = service_name
        captured["kwargs"] = kwargs
        return fake_client

    boto3_module = types.ModuleType("boto3")
    boto3_module.client = client
    botocore_module = types.ModuleType("botocore")
    config_module = types.ModuleType("botocore.config")
    config_module.Config = FakeConfig

    monkeypatch.setitem(sys.modules, "boto3", boto3_module)
    monkeypatch.setitem(sys.modules, "botocore", botocore_module)
    monkeypatch.setitem(sys.modules, "botocore.config", config_module)
    return captured, fake_client


def make_settings() -> Settings:
    return Settings(
        storage_backend="s3",
        s3_bucket="risolvi-private",
        s3_region="eu-central-1",
        s3_endpoint_url="https://project.storage.example/storage/v1/s3",
        s3_force_path_style=True,
    )


def test_s3_path_style_is_explicit_for_compatible_provider(monkeypatch):
    captured, _ = install_fake_boto(monkeypatch)
    S3PrivateStorage(make_settings())

    assert captured["service_name"] == "s3"
    kwargs = captured["kwargs"]
    assert kwargs["region_name"] == "eu-central-1"
    assert kwargs["endpoint_url"] == "https://project.storage.example/storage/v1/s3"
    assert kwargs["config"].kwargs == {"s3": {"addressing_style": "path"}}


def test_s3_upload_does_not_send_provider_incompatible_sse_header(monkeypatch):
    _, fake_client = install_fake_boto(monkeypatch)
    storage = S3PrivateStorage(make_settings())

    storage.put("cases/case-1/document-1", b"synthetic", "text/plain")

    assert fake_client.put_calls == [
        {
            "Bucket": "risolvi-private",
            "Key": "cases/case-1/document-1",
            "Body": b"synthetic",
            "ContentType": "text/plain",
        }
    ]
    assert "ServerSideEncryption" not in fake_client.put_calls[0]


def test_s3_delete_can_be_verified_through_provider_neutral_file_not_found(monkeypatch):
    install_fake_boto(monkeypatch)
    storage = S3PrivateStorage(make_settings())
    key = "_preflight/delete-check"

    storage.put(key, b"synthetic", "text/plain")
    assert storage.get(key) == b"synthetic"
    storage.delete(key)

    with pytest.raises(FileNotFoundError, match=key):
        storage.get(key)
