# Car Cost Dashboard add-on

Acest add-on ruleaza aplicatia Car Cost Dashboard in Home Assistant pe NUC.

## Persistenta datelor

Datele active ale aplicatiei sunt salvate in volumul persistent al add-on-ului:

```text
/data/car-cost-dashboard
```

La prima pornire, add-on-ul copiaza datele initiale din folderul `data` inclus in repository. Dupa aceea, modificarile facute din interfata sunt scrise doar in zona persistenta a add-on-ului, astfel incat update-urile imaginii Docker sa nu stearga istoricul.

## Backup si restore pe Windows 11

Fluxul ramane manual, prin browser:

- `Descarca backup JSON` descarca un fisier `.json` pe PC-ul de pe care accesezi aplicatia.
- `Incarca backup` iti permite sa alegi un fisier `.json` de pe PC si sa il restaurezi in aplicatie.

Add-on-ul nu scrie automat pe Windows si nu are nevoie de Samba. Fisierele sunt salvate sau citite prin browser, exact ca un download/upload normal.

## Instalare ca add-on local

1. Copiaza repository-ul in folderul local de add-on-uri Home Assistant.
2. In Home Assistant mergi la `Settings -> Add-ons -> Add-on Store`.
3. Apasa meniul cu trei puncte si alege `Check for updates`.
4. Instaleaza `Car Cost Dashboard`.
5. Porneste add-on-ul si deschide interfata din pagina add-on-ului sau din sidebar.

## Acces

Add-on-ul expune aplicatia pe portul intern `3000` si suporta Ingress in Home Assistant.
