# pendant 30 parse les données de ram et cpu
# et extraire un json avec frame par frame toutes les données utiles
# pour l'entrainement du modèle
# on utilise psutil et top pour récupérer les données en input
# on stocke le tout dans un json performance_data.json
# sous forme de liste de dictionnaires : 
# {"timestamp": "...", "cpu_usage": ..., "ram_usage": ..., "top_output": "..."} 
import psutil
import json
import time
from datetime import datetime
import subprocess
import threading
import os

class PerformanceParser:
    def __init__(self, duration=30, interval=1):
        self.duration = duration
        self.interval = interval
        self.data = []

    def collect_data(self):
        end_time = time.time() + self.duration
        while time.time() < end_time:
            timestamp = datetime.now().isoformat()
            cpu_usage = psutil.cpu_percent(interval=None)
            ram_usage = psutil.virtual_memory().percent
            top_output = subprocess.check_output(['top', '-b', '-n', '1']).decode('utf-8')
            self.data.append({
                'timestamp': timestamp,
                'cpu_usage': cpu_usage,
                'ram_usage': ram_usage,
                'top_output': top_output
            })
            time.sleep(self.interval)

    def parse_performance_data(self):
        self.collect_data()
        return json.dumps(self.data, indent=4)
if __name__ == "__main__":
    parser = PerformanceParser(duration=30, interval=1)
    performance_data_json = parser.parse_performance_data()
    with open('performance_data.json', 'w') as f:
        f.write(performance_data_json)
    print("Performance data collected and saved to performance_data.json")
