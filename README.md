# Smart Resources – Plateforme de Benchmark ML

Plateforme de benchmark comparatif de librairies de Deep Learning, inspirée de GAIA Benchmark.  
Compare les performances de **PyTorch** et **TensorFlow/Keras** sur les datasets **CIFAR-100** et **Fashion MNIST**, avec un affichage en temps réel des métriques de training.

---

## Architecture

```
┌──────────────┐         ┌──────────────────┐
│   Navigateur │ ──80──▶ │  Nginx (Frontend) │
│              │         │  HTML/CSS/JS       │
└──────────────┘         │  + proxy /api/     │
                         └────────┬───────────┘
                                  │
                         ┌────────▼───────────┐
                         │  FastAPI (API)      │
                         │  Auth, Metrics,     │
                         │  Training mgmt      │
                         └──┬──────────┬───────┘
                            │          │
                   ┌────────▼──┐  ┌────▼──────────┐
                   │ PostgreSQL│  │     Kafka      │
                   │  (Users,  │  │ (Message broker)│
                   │  Metrics) │  └──┬──────────┬──┘
                   └───────────┘     │          │
                            ┌────────▼──┐ ┌─────▼──────────┐
                            │  Trainer   │ │   Trainer       │
                            │  PyTorch   │ │   TensorFlow    │
                            │ (CPU only) │ │   (CPU only)    │
                            └────────────┘ └────────────────┘
```

### Réseaux Docker

| Réseau         | Services                                                  |
|----------------|-----------------------------------------------------------|
| `frontend-net` | Frontend (Nginx), API                                     |
| `backend-net`  | API, PostgreSQL, Kafka, Zookeeper, Trainers               |

Seul le **port 80** (Nginx) est exposé à l'extérieur.  
Les conteneurs de training communiquent **uniquement** via Kafka.

---

## Lancement

```bash
docker-compose up -d --build
```

Puis ouvrir **http://localhost** dans un navigateur.

---

## Stack technique

| Brique              | Technologie                        |
|---------------------|------------------------------------|
| Frontend            | HTML / CSS / JS + Chart.js + Nginx |
| Backend REST        | Python FastAPI                     |
| Message broker      | Apache Kafka (Confluent)           |
| Base de données     | PostgreSQL 15                      |
| Training            | PyTorch, TensorFlow/Keras          |
| Datasets            | CIFAR-100, Fashion MNIST           |
| Conteneurisation    | Docker + Docker Compose            |

---

## Utilisateurs pré-existants

### Administrateurs

| Utilisateur | Mot de passe | Nom     | Prénom  |
|-------------|--------------|---------|---------|
| `admin1`    | `admin1`     | Premier | Admin   |
| `admin2`    | `admin2`     | Second  | Admin   |

### Utilisateurs standard

| Utilisateur | Mot de passe | Nom     | Prénom  |
|-------------|--------------|---------|---------|
| `user1`     | `user1`      | Dupont  | Jean    |
| `user2`     | `user2`      | Martin  | Marie   |
| `user3`     | `user3`      | Durand  | Pierre  |

> **Note :** Seuls les comptes **admin** peuvent visualiser les graphes d'utilisation CPU et RAM.

---

## Fonctionnalités

- **Page d'accueil** : formulaire de connexion + lien vers création de compte
- **Création de compte** : nom, prénom, identifiant, mot de passe
- **Dashboard** (page principale) :
  - Graphe de **précision** (accuracy) par epoch
  - Graphe de **vitesse d'exécution** (s/epoch)
  - Graphe d'**utilisation CPU** *(admin uniquement)*
  - Graphe d'**utilisation RAM** *(admin uniquement)*
  - Actualisation automatique toutes les **5 secondes**
- **Contacts**
- **CGU**
- **Déconnexion**

---

## Contraintes respectées

- Chaque brique est conteneurisée sous Docker
- Déploiement orchestré par Docker Compose
- Datasets stockés sur un volume partagé (`datasets`)
- Ressources CPU/mémoire limitées équitablement pour les trainers (1 CPU, 2 Go RAM)
- Les trainers ne communiquent qu'avec Kafka
- Aucun endpoint n'est accessible de l'extérieur (proxy Nginx, réseaux isolés)
- JWT pour l'authentification des requêtes API
