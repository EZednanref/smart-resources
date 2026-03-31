# Smart Resources – Plateforme de Benchmark ML

Le projet **Smart Resources** est une plateforme de benchmark pour comparer les performances de **PyTorch** et **TensorFlow** sur les datasets **CIFAR-100** et **Fashion MNIST**.

L'application affiche en temps réel les courbes d'entraînement avec actualisation automatique toutes les **5 secondes**.

## Groupe : 
Axel Malherbe
Antoine Kraus 
Enzo Fernandez 

## Lancement rapide

```bash
sudo docker-compose up -d --build
```

Puis ouvrir **http://localhost** dans un navigateur.

A noter : Le chargement des données peut prendre du temps 

## Utilisateurs pré-existants

Vous pouvez vous connecter avec les comptes suivants :

### Administrateurs (2)

| Identifiant | Mot de passe |
|-------------|--------------|
| `admin1`    | `admin1`     |
| `admin2`    | `admin2`     |

*Les admins peuvent visualiser l'utilisation CPU et RAM.*

### Utilisateurs standard (3)

| Identifiant | Mot de passe |
|-------------|--------------|
| `user1`     | `user1`      |
| `user2`     | `user2`      |
| `user3`     | `user3`      |

---

## Fonctionnalités principales

- **Connexion sécurisée** avec JWT
- **Dashboard en temps réel** : graphes de précision, vitesse, CPU, RAM
- **Sélecteur de dataset** : basculez entre CIFAR-100 et Fashion MNIST
- **Comparaison live** : PyTorch (bleu) vs TensorFlow (rouge)
- **Création de compte** : inscription possible pour nouveaux utilisateurs

---

## Architecture technique

- **Frontend** : HTML/CSS/JS + Chart.js + Nginx
- **Backend** : Python FastAPI
- **Base de données** : PostgreSQL 15
- **Message broker** : Apache Kafka
- **ML Frameworks** : PyTorch, TensorFlow/Keras
- **Conteneurisation** : Docker + Docker Compose

Chaque composant tourne dans son propre conteneur Docker, isolé sur des réseaux dédiés pour la sécurité.
