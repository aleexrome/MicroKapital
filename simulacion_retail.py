"""
Simulacion de comportamiento de clientes en retail y prediccion
de la probabilidad de compra mediante un modelo de clasificacion.

Proyecto universitario - Ingenieria Industrial
Librerias: pandas, numpy, scikit-learn, matplotlib
"""

# =====================================================================
# 1. IMPORTACION DE LIBRERIAS
# =====================================================================
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)


# =====================================================================
# 2. GENERACION DEL DATASET SIMULADO
# =====================================================================
# Se crean 250 registros de clientes ficticios. Cada cliente tiene:
#   - tiempo_en_tienda: minutos que el cliente permanece dentro de la tienda.
#   - productos_vistos: cantidad de productos que observo/interactuo.
#   - edad: edad del cliente en anios.
#   - compra: variable objetivo (1 = compro, 0 = no compro).
#
# La probabilidad de compra se construye a partir de una combinacion
# lineal de las variables + ruido, transformada con la funcion sigmoide
# para obtener una probabilidad realista entre 0 y 1.
# =====================================================================
def generar_dataset(n_registros: int = 250, semilla: int = 42) -> pd.DataFrame:
    np.random.seed(semilla)

    tiempo_en_tienda = np.random.normal(loc=20, scale=8, size=n_registros).clip(1, 60)
    productos_vistos = np.random.poisson(lam=6, size=n_registros).clip(0, 25)
    edad = np.random.normal(loc=38, scale=12, size=n_registros).clip(18, 75)

    # Combinacion lineal: a mayor tiempo y productos vistos, mayor chance
    # de compra. La edad tiene un efecto moderado.
    logits = (
        -4.0
        + 0.08 * tiempo_en_tienda
        + 0.35 * productos_vistos
        + 0.02 * edad
        + np.random.normal(0, 0.8, size=n_registros)
    )
    probabilidad = 1 / (1 + np.exp(-logits))           # Funcion sigmoide
    compra = (probabilidad > 0.5).astype(int)          # Etiqueta binaria

    df = pd.DataFrame(
        {
            "tiempo_en_tienda": np.round(tiempo_en_tienda, 2),
            "productos_vistos": productos_vistos,
            "edad": np.round(edad).astype(int),
            "compra": compra,
        }
    )
    return df


# =====================================================================
# 3. EXPLORACION INICIAL DE LOS DATOS
# =====================================================================
def explorar_datos(df: pd.DataFrame) -> None:
    print("=" * 70)
    print(" DATASET SIMULADO DE CLIENTES EN RETAIL")
    print("=" * 70)
    print(f"Cantidad de registros: {len(df)}")
    print("\nPrimeros 10 registros:")
    print(df.head(10).to_string(index=False))

    print("\nEstadisticas descriptivas:")
    print(df.describe().round(2).to_string())

    print("\nDistribucion de la variable objetivo (compra):")
    print(df["compra"].value_counts().rename({0: "No compro", 1: "Compro"}).to_string())
    print("=" * 70)


# =====================================================================
# 4. ENTRENAMIENTO DEL MODELO DE CLASIFICACION
# =====================================================================
# Se usa Regresion Logistica. Los datos se estandarizan para que las
# variables queden en la misma escala y el modelo converja mejor.
# =====================================================================
def entrenar_modelo(df: pd.DataFrame):
    X = df[["tiempo_en_tienda", "productos_vistos", "edad"]]
    y = df["compra"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    escalador = StandardScaler()
    X_train_esc = escalador.fit_transform(X_train)
    X_test_esc = escalador.transform(X_test)

    modelo = LogisticRegression(max_iter=1000, random_state=42)
    modelo.fit(X_train_esc, y_train)

    y_pred = modelo.predict(X_test_esc)
    precision = accuracy_score(y_test, y_pred)

    print("\n" + "=" * 70)
    print(" RESULTADOS DEL MODELO - REGRESION LOGISTICA")
    print("=" * 70)
    print(f"Precision (accuracy): {precision * 100:.2f}%")

    print("\nMatriz de confusion:")
    mc = confusion_matrix(y_test, y_pred)
    print(pd.DataFrame(
        mc,
        index=["Real: No compro", "Real: Compro"],
        columns=["Pred: No compro", "Pred: Compro"],
    ).to_string())

    print("\nReporte de clasificacion:")
    print(classification_report(y_test, y_pred, target_names=["No compro", "Compro"]))

    # Coeficientes del modelo - importancia relativa de cada variable.
    print("Coeficientes del modelo (variables estandarizadas):")
    for variable, coef in zip(X.columns, modelo.coef_[0]):
        print(f"  {variable:20s} -> {coef:+.4f}")
    print("=" * 70)

    return modelo, escalador, X_test, y_test, y_pred


# =====================================================================
# 5. EJEMPLO DE PREDICCION PARA UN CLIENTE NUEVO
# =====================================================================
def predecir_cliente(modelo, escalador, tiempo: float, productos: int, edad: int) -> None:
    nuevo = np.array([[tiempo, productos, edad]])
    nuevo_esc = escalador.transform(nuevo)
    proba = modelo.predict_proba(nuevo_esc)[0, 1]
    clase = modelo.predict(nuevo_esc)[0]

    print("\n--- PREDICCION PARA UN CLIENTE NUEVO ---")
    print(f"Tiempo en tienda: {tiempo} min | Productos vistos: {productos} | Edad: {edad}")
    print(f"Probabilidad de compra: {proba * 100:.2f}%")
    print(f"Decision del modelo: {'COMPRA' if clase == 1 else 'NO COMPRA'}")


# =====================================================================
# 6. VISUALIZACIONES
# =====================================================================
# a) Distribucion de las variables numericas (histogramas).
# b) Relacion entre tiempo_en_tienda y productos_vistos, coloreada por
#    si el cliente compro o no (dispersion).
# =====================================================================
def graficar(df: pd.DataFrame) -> None:
    # --- Grafica 1: Histogramas de distribucion ---
    fig1, ejes = plt.subplots(1, 3, figsize=(14, 4))
    variables = ["tiempo_en_tienda", "productos_vistos", "edad"]
    colores = ["#4C72B0", "#55A868", "#C44E52"]

    for ax, var, color in zip(ejes, variables, colores):
        ax.hist(df[var], bins=20, color=color, edgecolor="black", alpha=0.8)
        ax.set_title(f"Distribucion: {var}")
        ax.set_xlabel(var)
        ax.set_ylabel("Frecuencia")

    fig1.suptitle("Distribucion de las variables del dataset", fontsize=13)
    fig1.tight_layout()

    # --- Grafica 2: Relacion entre variables ---
    fig2, ax2 = plt.subplots(figsize=(8, 6))
    no_compra = df[df["compra"] == 0]
    si_compra = df[df["compra"] == 1]

    ax2.scatter(
        no_compra["tiempo_en_tienda"],
        no_compra["productos_vistos"],
        c="#C44E52", label="No compro", alpha=0.7, edgecolor="black",
    )
    ax2.scatter(
        si_compra["tiempo_en_tienda"],
        si_compra["productos_vistos"],
        c="#55A868", label="Compro", alpha=0.7, edgecolor="black",
    )
    ax2.set_xlabel("Tiempo en tienda (min)")
    ax2.set_ylabel("Productos vistos")
    ax2.set_title("Relacion tiempo en tienda vs productos vistos")
    ax2.legend()
    ax2.grid(True, linestyle="--", alpha=0.5)

    plt.show()


# =====================================================================
# 7. FLUJO PRINCIPAL
# =====================================================================
def main() -> None:
    df = generar_dataset(n_registros=250, semilla=42)
    explorar_datos(df)

    modelo, escalador, _, _, _ = entrenar_modelo(df)

    # Dos clientes de ejemplo para probar el modelo entrenado.
    predecir_cliente(modelo, escalador, tiempo=35, productos=12, edad=29)
    predecir_cliente(modelo, escalador, tiempo=5,  productos=1,  edad=60)

    graficar(df)


if __name__ == "__main__":
    main()
