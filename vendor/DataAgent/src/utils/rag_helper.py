"""RAG retrieval helper for keyword extraction and document retrieval"""
import asyncio
import json
import logging
import os
import platform
from typing import List, Dict, Set

from src.config.loader import load_yaml_config
from src.rag.retrieve_rag_flow import RAGFlowClient
from src.utils.format_utils import repair_json_output
from src.utils.llm_utils import astream
from src.utils.tag_manager import tag_scope, MessageTag

logger = logging.getLogger(__name__)


class RAGHelper:
    """Helper class for RAG-based keyword extraction, document retrieval, and data source information"""
    
    def __init__(self, extract_llm):
        """
        Initialize RAG helper
        
        Args:
            extract_llm: LLM instance for keyword extraction
        """
        self.extract_llm = extract_llm
        self.config = load_yaml_config("conf.yaml")
        
        # Load RAGFlow configuration
        ragflow_config = self.config.get("ragflow", {})
        self.base_url = ragflow_config.get("base_url", "")
        self.api_key = ragflow_config.get("api_key", "")
        self.dataset_map = ragflow_config.get("datasets", {})
        
        # Load CSV data directory configuration
        csv_data_dir_config = self.config.get("app", {}).get("csv_data_directory", {})
        system = platform.system()
        self.csv_data_directory = csv_data_dir_config.get("windows" if system == "Windows" else "linux", "")
        
    async def extract_keywords(self, question: str, config) -> List[Dict]:
        """
        Extract keywords from user question
        
        Args:
            question: User's question
            config: Runnable config
            
        Returns:
            List of extracted keywords with similar terms
        """
        from src.prompts.template import apply_prompt_template
        
        input_ = {
            "messages": [{"role": "user", "content": question}],
            "question": question
        }

        extract_messages = apply_prompt_template("extract_keywords", input_)
        with tag_scope(config, MessageTag.THINK):
            result = await astream(
                self.extract_llm,
                extract_messages,
                {"thinking": {"type": "enabled"}},
                config=config
            )
        logger.info(f"Extract response: {result.content}")
        
        try:
            extract_content = json.loads(repair_json_output(result.content))
            return extract_content.get("extracted_keywords", [])
        except Exception as e:
            logger.error(f"Extract error: {str(e)}")
            return []
    
    def _get_agent_data_sources_info(self) -> str:
        """
        Get all agent data source information (CSV files and database table information)
        
        Returns:
            Formatted data source information text
        """
        from src.utils.scan_files import scan_directory
        from src.utils.db_helper import get_tables_info, format_tables_info_as_text
        
        try:
            # Get configuration - support both new and legacy structure
            agent_data_sources = self.config.get("agents", {}).get("data_sources", {}) or self.config.get("agent_data_sources", {})
            mysql_config = self.config.get("database", {}).get("mysql", {}) or self.config.get("mysql", {})
            
            if not agent_data_sources:
                logger.warning("No agent data sources configuration found")
                return ""
            
            result = []
            result.append("# Agent Data Sources\n")
            
            for agent_name, data_sources in agent_data_sources.items():
                result.append(f"## Agent: {agent_name}\n")
                
                # Process CSV file information from CSV data directory
                csv_files = data_sources.get("csv", [])
                if csv_files and self.csv_data_directory and os.path.exists(self.csv_data_directory):
                    result.append("### CSV Files\n")
                    try:
                        # Scan CSV data directory to get file information
                        csv_info_json = scan_directory(self.csv_data_directory)
                        csv_info = json.loads(csv_info_json) if csv_info_json else []
                        
                        # Filter CSV files specified in configuration
                        filtered_csv_info = [
                            file_info for file_info in csv_info 
                            if file_info.get('file_name') in csv_files
                        ]
                        
                        if filtered_csv_info:
                            for file_info in filtered_csv_info:
                                result.append(f"#### File: {file_info.get('file_name')}")
                                result.append(f"- Path: {file_info.get('file_path')}")
                                result.append(f"- Separator: {file_info.get('file_separator')}")
                                result.append(f"- File Size: {file_info.get('file_size')}")
                                result.append(f"- Row Count: {file_info.get('row_count')}")
                                result.append(f"- Column Count: {file_info.get('column_count')}\n")
                                
                                result.append("**Column Information:**")
                                result.append("| Column Name | Data Type | Non-Null Count | Null Count |")
                                result.append("|-------------|-----------|----------------|------------|")
                                
                                for col in file_info.get('column_info', []):
                                    col_name = col.get('column_name')
                                    data_type = col.get('data_type')
                                    non_null = col.get('non_null_count')
                                    null_count = col.get('null_count')
                                    result.append(f"| {col_name} | {data_type} | {non_null} | {null_count} |")
                                
                                result.append("")  # Empty line
                        else:
                            result.append("(Configured CSV files not found in CSV data directory)\n")
                            
                    except Exception as e:
                        logger.error(f"Error scanning CSV data directory for {agent_name}: {e}")
                        result.append(f"(Error scanning CSV files: {e})\n")
                elif csv_files:
                    result.append("### CSV Files (configured but not scanned yet)\n")
                    for csv_file in csv_files:
                        result.append(f"- {csv_file}\n")
                
                # Process database table information
                tables = data_sources.get("tables", [])
                if tables and mysql_config:
                    result.append("### Database Tables\n")
                    try:
                        tables_info = get_tables_info(mysql_config, tables)
                        if tables_info:
                            tables_text = format_tables_info_as_text(tables_info)
                            result.append(tables_text)
                        else:
                            result.append("(No table information found or connection failed)\n")
                    except Exception as e:
                        logger.error(f"Error getting table info for {agent_name}: {e}")
                        result.append(f"(Error retrieving table information: {e})\n")
                
                result.append("\n" + "="*80 + "\n")
            
            return "\n".join(result)
            
        except Exception as e:
            logger.error(f"Error getting agent data sources info: {e}")
            return ""
    
    async def retrieve_information(self, question: str, config, dataset: str = None, include_agent_data_sources: bool = True) -> str:
        """
        Retrieve all relevant information including data sources and RAG documents
        
        This is the unified entry point for all RAG enhancement, including:
        - Agent data sources (CSV files from configured directory and database tables)
        - RAG flow document retrieval
        
        Args:
            question: User's question
            config: Runnable config
            dataset: Optional dataset name to search in. If None, searches all configured datasets.
            include_agent_data_sources: Optionally get agent data source information
            
        Returns:
            Retrieved information as formatted string combining all sources
        """
        combined_info_parts = []
        
        # 1. Optionally get agent data source information (CSV and database tables)
        if include_agent_data_sources:
            logger.info("Retrieving agent data source information...")
            try:
                data_sources_info = self._get_agent_data_sources_info()
                if data_sources_info:
                    combined_info_parts.append(data_sources_info)
                    logger.info("Successfully retrieved agent data source information")
                else:
                    logger.info("No agent data source information available")
            except Exception as e:
                logger.error(f"Failed to get agent data sources info: {e}")
        
        # 2. Get RAG flow document retrieval
        # Check if RAG service is configured
        if not self.base_url or not self.api_key:
            logger.warning("RAG service not configured (missing base_url or api_key). Skipping RAG retrieval.")
        elif not self.dataset_map:
            logger.warning("RAG datasets not configured. Skipping RAG retrieval.")
        else:
            # Determine which datasets to use
            dataset_map_to_use = None
            
            if dataset:
                # If specific dataset is requested, validate it exists
                if dataset not in self.dataset_map:
                    logger.warning(f"Dataset '{dataset}' not found in configuration. Available datasets: {list(self.dataset_map.keys())}")
                else:
                    # Filter to only the requested dataset
                    dataset_map_to_use = {dataset: self.dataset_map[dataset]}
            else:
                # Use all datasets
                dataset_map_to_use = self.dataset_map
            
            # Only proceed if we have datasets to search
            if not dataset_map_to_use:
                logger.warning("No valid datasets to search. Skipping RAG retrieval.")
            else:
                try:
                    logger.info("Retrieving documents from RAG service...")
                    client = RAGFlowClient(
                        base_url=self.base_url,
                        api_key=self.api_key
                    )
                    
                    # Extract and expand keywords
                    extract_keywords = await self.extract_keywords(question, config)
                    
                    # Build search terms set
                    search_terms: Set[str] = {question}
                    for keyword in extract_keywords:
                        search_terms.add(keyword.get('original', ''))
                        for similar in keyword.get('similar', []):
                            search_terms.add(similar)
                    
                    # Remove empty strings
                    search_terms.discard('')
                    
                    # Concurrent retrieval across selected dataset(s) and search terms
                    retrieval_tasks = []
                    retrieval_labels = []
                    
                    for term in search_terms:
                        for source_label, dataset_id in dataset_map_to_use.items():
                            retrieval_tasks.append(
                                asyncio.to_thread(client.get_chunks_content, term, [dataset_id])
                            )
                            retrieval_labels.append(source_label)
                    
                    # Execute all retrievals concurrently
                    results = await asyncio.gather(*retrieval_tasks, return_exceptions=True)
                    
                    # Deduplicate and format results
                    retrieved_chunks: Set[str] = set()
                    for i, result in enumerate(results):
                        # Handle exceptions from individual retrievals
                        if isinstance(result, Exception):
                            logger.warning(f"Retrieval task {i} failed: {str(result)}")
                            continue
                            
                        label = retrieval_labels[i]
                        for chunk in result:
                            formatted_chunk = json.dumps(
                                {label: chunk}, 
                                indent=2, 
                                ensure_ascii=False
                            )
                            retrieved_chunks.add(formatted_chunk)
                    
                    if retrieved_chunks:
                        rag_info = "\n".join(retrieved_chunks)
                        combined_info_parts.append(rag_info)
                        logger.info(f"Retrieved {len(retrieved_chunks)} unique chunks from RAG service")
                    else:
                        logger.warning("No chunks retrieved from RAG service")
                
                except Exception as e:
                    logger.warning(f"RAG service connection failed: {str(e)}. Continuing without RAG retrieval.")
        
        # Combine all information parts
        if combined_info_parts:
            final_info = "\n\n".join(combined_info_parts)
            logger.info(f"Total retrieved information: {len(final_info)} characters")
            return final_info
        
        logger.info("No information retrieved from any source")
        return ""

