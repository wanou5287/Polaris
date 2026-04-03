CREATE DATABASE IF NOT EXISTS bi_center CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE bi_center;

CREATE TABLE IF NOT EXISTS package_bootstrap_marker (
  id INT PRIMARY KEY AUTO_INCREMENT,
  marker_name VARCHAR(64) NOT NULL,
  marker_value VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO package_bootstrap_marker (marker_name, marker_value)
SELECT 'seed_mode', 'minimal'
WHERE NOT EXISTS (
  SELECT 1 FROM package_bootstrap_marker WHERE marker_name = 'seed_mode'
);
