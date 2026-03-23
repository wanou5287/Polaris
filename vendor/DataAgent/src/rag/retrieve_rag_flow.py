from typing import List, Dict, Any

import requests


class RAGFlowClient:
    def __init__(self, base_url: str, api_key: str):
        """
        Initialize RAGFlow client

        Args:
            base_url: API base URL, e.g. "http://localhost:9380"
            api_key: Authentication key
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }

    def retrieve(self, question: str, dataset_ids: List[str]) -> Dict[str, Any]:
        """
        Execute retrieval query

        Args:
            question: Question text
            dataset_ids: List of dataset IDs

        Returns:
            Complete API response data
        """
        url = f"{self.base_url}/api/v1/retrieval"
        data = {
            "question": question,
            "dataset_ids": dataset_ids,
            "vector_similarity_weight": 0.3,
            "similarity_threshold": 0.1
        }

        try:
            response = requests.post(url, headers=self.headers, json=data)
            response.raise_for_status()  # Raise exception if status code is not 200
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"API request failed: {e}")
            return {}

    def get_chunks_content(self, question: str, dataset_ids: List[str],
                           clean_content: bool = True) -> List[str]:
        """
        Get plain text content from retrieval results

        Args:
            question: Question text
            dataset_ids: List of dataset IDs
            clean_content: Whether to clean content (remove tabs, etc.)

        Returns:
            List of text content
        """
        result = self.retrieve(question, dataset_ids)

        if not result.get("data") or not result["data"].get("chunks"):
            return []

        chunks = []
        for chunk in result["data"]["chunks"]:
            content = chunk["content"]
            if clean_content:
                content = content.replace("\t", "").replace("\r", "\r\n")
            chunks.append(content)

        return chunks