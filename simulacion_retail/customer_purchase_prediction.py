"""
================================================================================
 SISTEMA DE SIMULACIÓN Y PREDICCIÓN DEL COMPORTAMIENTO DEL CLIENTE (DIGITAL TWIN)
================================================================================

 Proyecto universitario - Ingeniería Industrial
 Descripción:
     Sistema completo que construye un "gemelo digital" (Digital Twin) de una
     tienda retail. El sistema simula la llegada de clientes con atributos
     estocásticos (edad, tiempo en tienda, productos vistos), entrena modelos
     de clasificación (Regresión Logística y Árbol de Decisión) para predecir
     la probabilidad de compra, realiza un análisis descriptivo y genera
     visualizaciones. Además, permite al usuario ingresar datos manualmente
     para obtener una predicción en tiempo real.

 Estructura del programa (por funciones):
     1. simular_clientes(...)         -> Genera el dataset sintético.
     2. calcular_estadisticas(...)    -> KPIs del negocio (conversión, etc.).
     3. entrenar_modelos(...)         -> Ajusta Logit y Árbol de Decisión.
     4. evaluar_modelos(...)          -> Métricas sobre el conjunto de prueba.
     5. visualizar_datos(...)         -> Gráficas descriptivas y analíticas.
     6. prediccion_interactiva(...)   -> Interfaz por consola para el usuario.
     7. main()                        -> Orquesta todo el flujo.

 Librerías: numpy, pandas, matplotlib, seaborn, scikit-learn.
================================================================================
"""

# ------------------------------------------------------------------------------
# 1. IMPORTACIÓN DE LIBRERÍAS
# ------------------------------------------------------------------------------
# numpy y pandas: manejo numérico y de datos tabulares.
# matplotlib / seaborn: visualización estadística.
# sklearn: algoritmos de aprendizaje automático y métricas.
# ------------------------------------------------------------------------------
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier, plot_tree
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    classification_report,
    roc_auc_score,
    roc_curve,
)

# Semilla global para reproducibilidad de los experimentos.
SEED = 42
np.random.seed(SEED)

# Estilo visual uniforme para todas las gráficas.
sns.set_theme(style="whitegrid", context="talk")


# ------------------------------------------------------------------------------
# 2. SIMULACIÓN (DIGITAL TWIN)
# ------------------------------------------------------------------------------
def simular_clientes(n_clientes: int = 400, seed: int = SEED) -> pd.DataFrame:
    """
    Simula el comportamiento de `n_clientes` en una tienda retail.

    Cada cliente sintético posee los siguientes atributos:
        - edad (años)              : distribución normal truncada [18, 75].
        - tiempo_en_tienda (min)   : distribución gamma (asimétrica positiva).
        - productos_vistos (u.)    : distribución de Poisson dependiente
                                     del tiempo en tienda (relación realista).
        - dia_semana (0=Lun..6=Dom): variable categórica uniforme.
        - promocion_activa (0/1)   : indicador binario aleatorio.

    La variable objetivo `compra` se construye mediante un modelo logístico
    latente (ground truth) a partir de las variables explicativas, añadiendo
    ruido para aproximar el comportamiento estocástico humano. Ese modelo
    latente NO se expone al clasificador: él debe *aprenderlo* de los datos.

    Parámetros
    ----------
    n_clientes : int
        Número de clientes a simular (>= 200 según especificación).
    seed : int
        Semilla para reproducibilidad.

    Retorna
    -------
    pd.DataFrame con las observaciones simuladas.
    """
    rng = np.random.default_rng(seed)

    # --- Edad: normal truncada con media 38 y desvío 13 ---------------------
    edad = rng.normal(loc=38, scale=13, size=n_clientes)
    edad = np.clip(edad, 18, 75).round().astype(int)

    # --- Tiempo en tienda (min): gamma, media ~15 min, rango [1, 60] --------
    # La distribución gamma modela bien variables positivas y asimétricas.
    tiempo = rng.gamma(shape=2.0, scale=7.5, size=n_clientes)
    tiempo = np.clip(tiempo, 1, 60).round(2)

    # --- Productos vistos: Poisson cuyo λ depende del tiempo ---------------
    # Supuesto: cuanto más tiempo pasa el cliente, más productos ve.
    lambda_prod = 0.4 * tiempo + 1.0
    productos = rng.poisson(lam=lambda_prod)
    productos = np.clip(productos, 0, 40)

    # --- Día de la semana (0 = Lunes, 6 = Domingo) --------------------------
    dia_semana = rng.integers(low=0, high=7, size=n_clientes)

    # --- Promoción activa: 35 % de probabilidad -----------------------------
    promo = rng.binomial(n=1, p=0.35, size=n_clientes)

    # ------------------------------------------------------------------------
    # Generación de la variable objetivo (compra) mediante un modelo latente
    # logístico. Los coeficientes reflejan hipótesis de negocio:
    #   + tiempo en tienda  -> más probabilidad de compra
    #   + productos vistos  -> más probabilidad de compra
    #   + promoción activa  -> más probabilidad de compra
    #   edad: efecto cuadrático (compran más los de mediana edad)
    # ------------------------------------------------------------------------
    logit = (
        -4.2
        + 0.12 * tiempo
        + 0.18 * productos
        + 0.80 * promo
        + 0.05 * (edad - 18)
        - 0.0008 * (edad - 40) ** 2
    )
    # Ruido gaussiano para simular variabilidad no observada.
    logit += rng.normal(loc=0.0, scale=0.4, size=n_clientes)

    # Transformación logística: convierte la puntuación a probabilidad.
    prob_real = 1.0 / (1.0 + np.exp(-logit))
    compra = (rng.random(n_clientes) < prob_real).astype(int)

    # Se ensambla el DataFrame final.
    df = pd.DataFrame(
        {
            "edad": edad,
            "tiempo_en_tienda": tiempo,
            "productos_vistos": productos,
            "dia_semana": dia_semana,
            "promocion_activa": promo,
            "compra": compra,
        }
    )
    return df


# ------------------------------------------------------------------------------
# 3. ANÁLISIS DESCRIPTIVO
# ------------------------------------------------------------------------------
def calcular_estadisticas(df: pd.DataFrame) -> dict:
    """
    Calcula KPIs e indicadores descriptivos básicos del negocio.

    Parámetros
    ----------
    df : pd.DataFrame
        Dataset simulado de clientes.

    Retorna
    -------
    dict con los indicadores principales (y los imprime por consola).
    """
    total_clientes = len(df)
    total_compradores = int(df["compra"].sum())
    tasa_conversion = total_compradores / total_clientes

    kpis = {
        "total_clientes": total_clientes,
        "total_compradores": total_compradores,
        "tasa_conversion": round(tasa_conversion, 4),
        "tiempo_promedio_min": round(df["tiempo_en_tienda"].mean(), 2),
        "productos_promedio": round(df["productos_vistos"].mean(), 2),
        "edad_promedio": round(df["edad"].mean(), 1),
        "tiempo_prom_compradores": round(
            df.loc[df["compra"] == 1, "tiempo_en_tienda"].mean(), 2
        ),
        "tiempo_prom_no_compradores": round(
            df.loc[df["compra"] == 0, "tiempo_en_tienda"].mean(), 2
        ),
    }

    # Informe por consola con formato.
    print("\n" + "=" * 70)
    print(" ANÁLISIS DESCRIPTIVO DE LA TIENDA (DIGITAL TWIN)")
    print("=" * 70)
    print(f"  Total de clientes simulados ........ {kpis['total_clientes']}")
    print(f"  Compradores ........................ {kpis['total_compradores']}")
    print(f"  Tasa de conversión ................. {kpis['tasa_conversion']*100:.2f} %")
    print(f"  Tiempo promedio en tienda (min) .... {kpis['tiempo_promedio_min']}")
    print(f"     - compradores ................... {kpis['tiempo_prom_compradores']}")
    print(f"     - no compradores ................ {kpis['tiempo_prom_no_compradores']}")
    print(f"  Productos vistos (promedio) ........ {kpis['productos_promedio']}")
    print(f"  Edad promedio ...................... {kpis['edad_promedio']}")
    print("=" * 70)

    return kpis


# ------------------------------------------------------------------------------
# 4. ENTRENAMIENTO DE LOS MODELOS DE IA
# ------------------------------------------------------------------------------
def entrenar_modelos(df: pd.DataFrame, seed: int = SEED):
    """
    Entrena dos clasificadores supervisados:
        - Regresión Logística (lineal, interpretable).
        - Árbol de Decisión (no lineal, captura interacciones).

    El dataset se divide en entrenamiento (80 %) y prueba (20 %).
    Las variables numéricas se estandarizan para la regresión logística
    (escalar NO afecta al árbol, pero lo aplicamos por consistencia).

    Retorna
    -------
    Un diccionario con los modelos entrenados y los conjuntos de prueba,
    necesarios para su posterior evaluación y para la predicción interactiva.
    """
    # Variables predictoras (features) y objetivo (target).
    features = ["edad", "tiempo_en_tienda", "productos_vistos",
                "dia_semana", "promocion_activa"]
    X = df[features].values
    y = df["compra"].values

    # Partición entrenamiento/prueba estratificada: mantiene la proporción
    # de clases en ambos subconjuntos (crucial cuando hay desbalance).
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=seed, stratify=y
    )

    # Estandarización (media 0, desvío 1). Se ajusta SOLO con el train
    # para evitar fuga de información del conjunto de prueba.
    scaler = StandardScaler()
    X_train_std = scaler.fit_transform(X_train)
    X_test_std = scaler.transform(X_test)

    # --- Modelo 1: Regresión logística -------------------------------------
    # Es el modelo "natural" cuando la salida es una probabilidad binaria.
    modelo_logit = LogisticRegression(max_iter=1000, random_state=seed)
    modelo_logit.fit(X_train_std, y_train)

    # --- Modelo 2: Árbol de decisión ---------------------------------------
    # max_depth limita la complejidad para reducir sobreajuste.
    modelo_arbol = DecisionTreeClassifier(
        max_depth=5, min_samples_leaf=10, random_state=seed
    )
    modelo_arbol.fit(X_train_std, y_train)

    return {
        "features": features,
        "scaler": scaler,
        "logit": modelo_logit,
        "arbol": modelo_arbol,
        "X_test": X_test_std,
        "y_test": y_test,
        "X_train": X_train_std,
        "y_train": y_train,
    }


# ------------------------------------------------------------------------------
# 5. EVALUACIÓN DE LOS MODELOS
# ------------------------------------------------------------------------------
def evaluar_modelos(artefactos: dict) -> None:
    """
    Imprime métricas de desempeño sobre el conjunto de prueba para ambos
    modelos: accuracy, matriz de confusión, reporte de clasificación y AUC.
    """
    X_test, y_test = artefactos["X_test"], artefactos["y_test"]

    for nombre, clave in [("REGRESIÓN LOGÍSTICA", "logit"),
                          ("ÁRBOL DE DECISIÓN", "arbol")]:
        modelo = artefactos[clave]
        y_pred = modelo.predict(X_test)
        y_prob = modelo.predict_proba(X_test)[:, 1]

        acc = accuracy_score(y_test, y_pred)
        auc = roc_auc_score(y_test, y_prob)
        cm = confusion_matrix(y_test, y_pred)

        print("\n" + "-" * 70)
        print(f" DESEMPEÑO: {nombre}")
        print("-" * 70)
        print(f"  Accuracy (exactitud) : {acc:.4f}")
        print(f"  AUC-ROC              : {auc:.4f}")
        print("  Matriz de confusión  :")
        print(f"      [[TN={cm[0,0]:>3}  FP={cm[0,1]:>3}]")
        print(f"       [FN={cm[1,0]:>3}  TP={cm[1,1]:>3}]]")
        print("  Reporte de clasificación:")
        print(classification_report(y_test, y_pred,
              target_names=["No compra", "Compra"], digits=3))


# ------------------------------------------------------------------------------
# 6. VISUALIZACIÓN
# ------------------------------------------------------------------------------
def visualizar_datos(df: pd.DataFrame, artefactos: dict,
                     ruta_salida: str = "reporte_simulacion.png") -> None:
    """
    Genera un panel con múltiples gráficas:
        (a) Distribución de compradores vs no compradores.
        (b) Histograma del tiempo en tienda segmentado por compra.
        (c) Distribución de productos vistos.
        (d) Distribución de edad.
        (e) Dispersión tiempo vs productos (color = compra).
        (f) Curvas ROC de ambos modelos.

    La figura se guarda en disco y también se muestra por pantalla.
    """
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    fig.suptitle("Digital Twin Retail — Análisis del Comportamiento del Cliente",
                 fontsize=18, fontweight="bold")

    # (a) Conteo compra / no compra -----------------------------------------
    sns.countplot(x="compra", data=df, ax=axes[0, 0],
                  hue="compra", palette=["#E74C3C", "#27AE60"], legend=False)
    axes[0, 0].set_title("Clientes vs Compras")
    axes[0, 0].set_xticks([0, 1])
    axes[0, 0].set_xticklabels(["No compra", "Compra"])
    axes[0, 0].set_xlabel("")
    axes[0, 0].set_ylabel("N° de clientes")

    # (b) Tiempo en tienda por grupo ----------------------------------------
    sns.histplot(data=df, x="tiempo_en_tienda", hue="compra",
                 bins=25, kde=True, ax=axes[0, 1],
                 palette=["#E74C3C", "#27AE60"])
    axes[0, 1].set_title("Tiempo en tienda (min)")
    axes[0, 1].set_xlabel("Minutos")

    # (c) Productos vistos --------------------------------------------------
    sns.histplot(data=df, x="productos_vistos", hue="compra",
                 bins=20, ax=axes[0, 2],
                 palette=["#E74C3C", "#27AE60"])
    axes[0, 2].set_title("Productos vistos")
    axes[0, 2].set_xlabel("Unidades")

    # (d) Edad --------------------------------------------------------------
    sns.histplot(data=df, x="edad", hue="compra",
                 bins=20, kde=True, ax=axes[1, 0],
                 palette=["#E74C3C", "#27AE60"])
    axes[1, 0].set_title("Distribución de edad")
    axes[1, 0].set_xlabel("Años")

    # (e) Dispersión tiempo vs productos ------------------------------------
    sns.scatterplot(data=df, x="tiempo_en_tienda", y="productos_vistos",
                    hue="compra", ax=axes[1, 1], alpha=0.75,
                    palette=["#E74C3C", "#27AE60"])
    axes[1, 1].set_title("Tiempo vs Productos vistos")
    axes[1, 1].set_xlabel("Tiempo (min)")
    axes[1, 1].set_ylabel("Productos")

    # (f) Curvas ROC --------------------------------------------------------
    ax_roc = axes[1, 2]
    for nombre, clave, color in [("Logit", "logit", "#2980B9"),
                                 ("Árbol", "arbol", "#8E44AD")]:
        modelo = artefactos[clave]
        probs = modelo.predict_proba(artefactos["X_test"])[:, 1]
        fpr, tpr, _ = roc_curve(artefactos["y_test"], probs)
        auc = roc_auc_score(artefactos["y_test"], probs)
        ax_roc.plot(fpr, tpr, label=f"{nombre} (AUC={auc:.3f})",
                    linewidth=2, color=color)
    ax_roc.plot([0, 1], [0, 1], "k--", alpha=0.5)
    ax_roc.set_title("Curvas ROC")
    ax_roc.set_xlabel("Tasa de falsos positivos")
    ax_roc.set_ylabel("Tasa de verdaderos positivos")
    ax_roc.legend(loc="lower right")

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    plt.savefig(ruta_salida, dpi=130, bbox_inches="tight")
    print(f"\n[OK] Reporte visual guardado en: {ruta_salida}")

    # Se intenta mostrar la figura. En entornos sin GUI (p. ej. servidores)
    # se captura la excepción para no detener el programa.
    try:
        plt.show()
    except Exception:
        pass
    plt.close(fig)


# ------------------------------------------------------------------------------
# 7. INTERACCIÓN CON EL USUARIO (PREDICCIÓN EN TIEMPO REAL)
# ------------------------------------------------------------------------------
def _leer_float(mensaje: str, minimo: float, maximo: float) -> float:
    """Lee un valor numérico por consola validando el rango permitido."""
    while True:
        try:
            valor = float(input(mensaje).strip().replace(",", "."))
            if minimo <= valor <= maximo:
                return valor
            print(f"  ! El valor debe estar entre {minimo} y {maximo}.")
        except ValueError:
            print("  ! Entrada inválida. Ingrese un número.")


def _leer_int(mensaje: str, minimo: int, maximo: int) -> int:
    """Lee un entero por consola validando el rango permitido."""
    while True:
        try:
            valor = int(input(mensaje).strip())
            if minimo <= valor <= maximo:
                return valor
            print(f"  ! El valor debe estar entre {minimo} y {maximo}.")
        except ValueError:
            print("  ! Entrada inválida. Ingrese un entero.")


def prediccion_interactiva(artefactos: dict) -> None:
    """
    Bucle interactivo: pide datos al usuario y retorna la probabilidad de
    compra usando los dos modelos entrenados. El usuario puede repetir la
    consulta o salir escribiendo "n".
    """
    print("\n" + "#" * 70)
    print(" PREDICCIÓN INTERACTIVA DE PROBABILIDAD DE COMPRA")
    print("#" * 70)
    print(" Ingrese los atributos de un nuevo cliente para estimar su")
    print(" probabilidad de realizar una compra.")
    print("-" * 70)

    while True:
        edad = _leer_int("  Edad del cliente (18-75): ", 18, 75)
        tiempo = _leer_float("  Tiempo en tienda en minutos (1-60): ", 1, 60)
        productos = _leer_int("  Productos vistos (0-40): ", 0, 40)
        dia = _leer_int("  Día de la semana (0=Lun ... 6=Dom): ", 0, 6)
        promo = _leer_int("  ¿Hay promoción activa? (0=No, 1=Sí): ", 0, 1)

        # Se arma el vector en el mismo orden que se usó al entrenar.
        nuevo = np.array([[edad, tiempo, productos, dia, promo]], dtype=float)

        # Se aplica el mismo escalador ajustado con el train set.
        nuevo_std = artefactos["scaler"].transform(nuevo)

        # Predicciones de cada modelo.
        p_logit = artefactos["logit"].predict_proba(nuevo_std)[0, 1]
        p_arbol = artefactos["arbol"].predict_proba(nuevo_std)[0, 1]
        p_prom = (p_logit + p_arbol) / 2.0  # ensamble simple por promedio

        # Veredicto cualitativo para apoyar la lectura del resultado.
        if p_prom >= 0.70:
            etiqueta = "ALTA probabilidad de compra"
        elif p_prom >= 0.40:
            etiqueta = "Probabilidad MEDIA de compra"
        else:
            etiqueta = "BAJA probabilidad de compra"

        print("\n" + "-" * 70)
        print(" RESULTADO DE LA PREDICCIÓN")
        print("-" * 70)
        print(f"  Regresión logística : {p_logit*100:6.2f} %")
        print(f"  Árbol de decisión   : {p_arbol*100:6.2f} %")
        print(f"  Promedio (ensamble) : {p_prom*100:6.2f} %  ->  {etiqueta}")
        print("-" * 70)

        cont = input("\n¿Desea evaluar otro cliente? (s/n): ").strip().lower()
        if cont != "s":
            print("Finalizando módulo interactivo. ¡Hasta luego!")
            break


# ------------------------------------------------------------------------------
# 8. FUNCIÓN PRINCIPAL (ORQUESTADOR)
# ------------------------------------------------------------------------------
def main() -> None:
    """
    Ejecuta el flujo completo del sistema:
        1) Simulación de clientes.
        2) Cálculo de estadísticas descriptivas.
        3) Entrenamiento de modelos.
        4) Evaluación sobre el set de prueba.
        5) Visualización (gráficas guardadas en disco).
        6) Módulo interactivo de predicción.
    """
    print("=" * 70)
    print(" DIGITAL TWIN RETAIL — INICIANDO SIMULACIÓN")
    print("=" * 70)

    # Paso 1: simulación del comportamiento del cliente.
    df = simular_clientes(n_clientes=400, seed=SEED)
    print(f"[OK] Se simularon {len(df)} clientes.")
    print("\nMuestra de los primeros 5 registros simulados:")
    print(df.head().to_string(index=False))

    # Guardamos el dataset sintético por si el profesor desea inspeccionarlo.
    df.to_csv("clientes_simulados.csv", index=False)
    print("\n[OK] Dataset exportado a: clientes_simulados.csv")

    # Paso 2: KPIs y estadísticas descriptivas.
    calcular_estadisticas(df)

    # Paso 3: entrenamiento de modelos de IA.
    artefactos = entrenar_modelos(df, seed=SEED)
    print("\n[OK] Modelos entrenados: Regresión Logística y Árbol de Decisión.")

    # Paso 4: evaluación con métricas estándar.
    evaluar_modelos(artefactos)

    # Paso 5: gráficas analíticas.
    visualizar_datos(df, artefactos, ruta_salida="reporte_simulacion.png")

    # Paso 6: módulo interactivo.
    try:
        prediccion_interactiva(artefactos)
    except (EOFError, KeyboardInterrupt):
        # Permite ejecutar en entornos no interactivos sin errores.
        print("\n[INFO] Módulo interactivo omitido (entrada no disponible).")


# Punto de entrada estándar: permite ejecutar el script directamente
# (python customer_purchase_prediction.py) o importarlo como módulo.
if __name__ == "__main__":
    main()
