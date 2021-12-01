![GROUCHO_MARX!](https://media.giphy.com/media/26tnoy9IN4bouDHEY/giphy.gif)
# Qué es groucho
Groucho es el motor de evaluación de banderas configurables sobre contrataciones públicas en el estándar de Datos para las Contrataciones Abiertas (EDCA) (OCDS, por sus siglas en inglés Open Contracting Data Standard)

# Implementaciones
Una implementación es una adaptación de todas las posibles evaluaciones de banderas a un dataset en particular. El dataset en cuestión puede contemplar una o varias fuentes de información en algún país. Se hace una adaptación de la fuente original al esquema OCDS y se evalúa cómo se puede adaptar la calificación de banderas para cada país considerando las diferencias en los sistemas de contratación.

- Costa Rica [Ruleset](https://github.com/ProjectPODER/groucho/blob/main/flagsCR-2021.json) [https://todosloscontratos.cr]
- México [Ruleset 2021](https://github.com/ProjectPODER/groucho/blob/main/flagsMX-2021.json) [Ruleset 2019](https://github.com/ProjectPODER/groucho/blob/main/flagsMX.json) [https://todosloscontratos.mx]

# Metodología
Las evaluaciones de banderas se hacen en dos niveles: banderas de contrato y banderas de entidad.

## Método para evaluar puntajes de contratos (contract flags)
Evaluamos en Costa Rica las siguientes 22 banderas divididas en 4 categorías para cada contrato:

### Competitividad
En esta categoría consideramos 5 banderas que a continuación se describen:

**Campos fundamentales:** Los campos necesarios para hacer la evaluación de esta categoría están presentes y tienen valores válidos. Los campos evaluados de acuerdo al esquema OCDS son: "planning budget amount amount", "planning budget amount currency", "tender procurement Method", "tender procurement Method Details", "tender procurement Method Rationale" y "tender main Procurement Category" para los parties con rol de “supplier”. El puntaje de esta bandera se expresa como un porcentaje de campos presentes.

**Contratos realizados entre dos entes públicos:** Si el contrato se realizó entre dos entes públicos se considera un puntaje de cero. Se considera ente público cualquier buyer y si el supplier se encuentra dentro de un listado cerrado predefinido de entes públicos que pueden ofrecer bienes o servicios.

**Empresas con domicilio en países con alto índice de corrupción:** Si el proveedor está basado en uno de los países con un índice de percepción de corrupción superior al de Costa Rica de acuerdo al estudio realizado en 2020 por Transparency International  (https://www.transparency.org/en/cpi/2020/index ) el puntaje se considera cero.

**Estimación fuera de rango:** Si el monto estimado para el contrato está alejado de manera desproporcionada del monto del contrato el puntaje se valora en cero, debido a que podría haber permitido un proceso menos competitivo del apropiado.

**Estimación perfecta:** Si el monto estimado para el contrato es igual hasta en 5 decimales al monto del contrato el puntaje se valora en cero, debido a que podría haber permitido un proceso menos competitivo del apropiado.

### Temporalidad

**Campos fundamentales:** Evaluamos si existe una fecha válida en los campos publicación de la oportunidad, adjudicación de contrato, inicio contrato y fin de contrato.

**Duraciones Largas:** En caso de que el período de ejecución del contrato es mayor a mil días se califica como cero.

**Firmas futuras:** Se califica como cero si la fecha de firma del contrato es posterior a la fecha de fin del contrato.

**Fecha de firma previa:** Si la fecha de firma del contrato es anterior a la fecha de notificación de la adjudicación se evalúa como cero.

**Fechas sospechosas:** En caso de que la fecha de firma o inicio del contrato coincide con un feriado oficial o día no laborable se evalúa como cero.

### Transparencia

**Porcentaje de campos del estándar:** Porcentaje de campos de OCDS que existen y tienen valor en el contrato.

**Campos completos Costarricences:** Porcentaje de campos de contratos costarricenses en OCDS que existen y tienen valor en el contrato.

**Secciones completas:** Evaluamos si contiene todas las secciones principales de OCDS.

### Trazabilidad

**Campos fundamentales para trazabilidad:** Consideramos la presencia de los siguientes campos: "planning.budget", "parties.name" (para buyer y supplier), "parties.identifier.id" (para suppliers) y "contract.id".

**Consorcios pseudónimos:** La cédula del proveedor comienza con “12”, indicando que es un consorcio. Dado que no existe un registro de consorcios, estos no permiten la trazabilidad de los proveedores.

**Comprensión del título:** El título es descriptivo y claro, no consiste solamente de códigos o abreviaciones.

**Dirección del proveedor:** La dirección del proveedor se debe especificar de manera completa.

**Importe redondeado:** El importe del contrato es un múltiplo de 10,000.

**Modificaciones al contrato:** El contrato ha sufrido modificaciones desde su publicación.

**Nombre atípico de proveedor:** El nombre del proveedor es inaceptable, por ejemplo una dirección web (URL).

**Monto estimado sin valor:** El monto estimado del contrato no existe, tiene valor 0 ó 1.

Se promedian los valores de las banderas correspondientes a cada categoría.

## Método para evaluar puntajes de entidad (party flags)

Evaluamos en Costa Rica las siguientes cinco categorías para cada entidad:

### Trazabilidad

**Cédula duplicada:** Una misma entidad tiene más de una cédula asignada con el mismo nombre.

**Monto de contrato repetido:** El monto del contrato se repite en un 10% de los casos. No aplica si hay diez o menos contratos al año.

**Título de contrato repetido:** El título del contrato se repite en un 10% de los casos. No aplica si hay diez o menos contratos al año.

### Competitividad

**Agente económico preponderante por monto:** Más del 30% del monto total de adjudicaciones de una dependencia/UC al mismo proveedor.

**Agente económico preponderante por cantidad:** Más del 30% de la cantidad total de adjudicaciones de una dependencia/UC al mismo proveedor.

**Contratos realizados el mismo día:** Una dependencia realiza el 30% de sus contratos del año en un mismo día. No aplica si hay diez o menos contratos al año.

### Confiabilidad

**Confiabilidad global:** Evaluación que se calcula con base en los puntajes de las partes con las cuales un comprador/proveedor se relaciona.

### Transparencia

Se calcula el porcentaje de contratos celebrados por una entidad que cumplen con las banderas de transparencia para contratos que están detalladas previamente.

### Temporalidad

Se calcula el porcentaje de contratos celebrados por una entidad que cumplen con las banderas de temporalidad para contratos que están detalladas previamente.

# Cómo utilizar Groucho

Para ejecutar Groucho es necesario realizar los siguientes pasos:
- Descargar el código utilizando git o descargando y descomprimiendo el ZIP de los archivos fuente.
- Instalar y configurar node y npm.
- Ejecutar el comando npm install en el directorio base de groucho.
- Obtener un conjunto de documentos OCDS para evaluar.
- Generar un archivo JSON con las definiciones de las banderas a evaluar. En la sección de Configuración se describe con mayor detalle el archivo de especificación de banderas.

## Modos de ejecución

Groucho permite realizar evaluaciones sobre contratos en dos fases distintas: contratos y entidades.

### Contratos

Para evaluar contratos en OCDS, Groucho recibe por stdin un stream de releases OCDS en newline-delimited JSON (cada línea contiene un documento JSON serializado). El único parámetro necesario es el path al archivo de definición de banderas, utilizando el argumento -f desde la consola. La salida de Groucho es un stream de evaluaciones en el mismo formato de entrada, con un objeto JSON serializado por cada línea de output.

```
(stream de objetos JSON) | node index.js -f [ARCHIVO_DE_DEFINICIÓN]
```

Si un release contiene varios contracts, Groucho realizará una evaluación distinta para cada contract.

### Entidades

Una vez exista al menos una evaluación de contratos realizada en el modo anterior, es posible evaluar las entidades participantes en los contratos mediante una serie de reglas predefinidas en el archivo de definición. Los documentos de evaluación generados por Groucho en el modo contratos deben estar almacenados en un índice de Elasticsearch, y luego se debe ejecutar el siguiente comando:

```
node index.js -m party -d [ELASTICSEARCH_URL] -c [ÍNDICE] -f [ARCHIVO_DE_DEFINICIÓN]
```

- ELASTICSEARCH_URL: string de conexión a la instancia de Elasticsearch donde se almacenan los documentos de evaluación, en el formato https://USER:PASS@URL:PUERTO/
- ÍNDICE: nombre exacto del índice de Elasticsearch que contiene los documentos.
- ARCHIVO_DE_DEFINICIÓN: ruta al archivo de definición de banderas.

Groucho determinará los documentos que debe analizar utilizando el ruleset_id establecido en el archivo de definición de banderas, y generará documentos de evaluación de entidades como objetos JSON serializados, un objeto por línea.

## Configuración

Cada fuente de datos requiere su propio ruleset (por ejemplo, los contratos publicados por [SICOP](https://github.com/ProjectPODER/groucho/blob/main/flagsCR-2021.json) de Costa Rica). Estos rulesets se separan en reglas de contrato y de party, definidas en un archivo JSON de especificación de banderas. La estructura del archivo es un objeto JSON con las siguientes propiedades:

- id: un identificador para el ruleset, lo cual permite almacenar distintos conjuntos de evaluaciones en la misma colección o índice.
- contracts: un array de definiciones de banderas de contrato.
- parties: un array de definiciones de banderas de entidad.

### Definiciones de contract flags

**Tipo: check-fields-bool**

Descripción: verifica que los campos existan, tengan valor, y su valor no sea "---" o "null".

Parámetros:
- fields: array de nombres de campo a verificar

**Tipo: check-fields-inverse**

Descripción: verifica que los campos NO existan o NO tengan valor.

Parámetros:
- fields: array de nombres de campo a verificar

**Tipo: check-schema-bool**

Descripción: valida que el schema de todo el documento sea válido. Incluye los schemas de las extensiones.

**Tipo: check-sections-rate**

Descripción: Valida que cada una de las secciones principales de cada release y del compiledRelease contengan al menos un campo lleno. Devuelve el porcentaje de secciones presentes en el documento.

Parámetros:
- fields: array con los nombres de las secciones de OCDS que se desea verificar.

**Tipo: date-difference-bool**

Descripción: Calcula la diferencia en días entre dos fechas.

Parámetros:
- fields.from fecha inicial que se resta de la siguiente.
- fields.to fecha final a la que se le resta la fecha inicial.
- difference.minimum: cantidad de días mínimos. Si la resta es menor, da false.
- difference.maximum: cantidad de días máximos. Si la resta es mayor, da false.

**Tipo: field-equality-bool**

Descripción: Compara el valor de dos campos, si son diferentes da false.

Parámetros:
- fields: array de campos a comparar.

**Tipo: check-dates-bool**

Descripción: Evalúa si las fechas de fields coinciden con alguna de las fechas de date. Si es así da false.

Parámetros:
- fields: Array de campos a verificar.
- dates: Array de fechas a verificar.

**Tipo: check-field-value-bool**

Descripción: Compara el valor de un campo contra un conjunto de valores predefinidos. Si existe alguna coincidencia el resultado es false.

Parámetros:
- fields: Array de campos a comprar.
- values: Array de valores contra los cuales comparar.

**Tipo: check-url-bool**

Descripción: Chequea que el campo contenga una url

Parámetros:
- fields: Array de campos a verificar

**Tipo: comprensibility**

Descripción: aplica una serie de funciones contra un string para determinar si éste es descriptivo y comprensible.

Parámetros:
- fields: Array de campos a verificar.

Cada campo de parámetros puede ser un array que soporta condiciones y operaciones.

### Definiciones de party flags

**Tipo: reliability**

Descripción: evalúa la confiabilidad de una entidad promediando el score total de las banderas de contrato de todas las entidades con las que ha realizado contratos.

Parámetros: ninguno

**Tipo: limited-party-summer-percent**

Descripción: compara la suma acumulada de los valores de un campo (por ejemplo, monto de contrato) para un proveedor contra un porcentaje de la suma acumulada del mismo campo para un comprador.

Parámetros:
- limit: array, los porcentajes de la suma acumulada del comprador contra el cual se compara para cada proveedor. Cada valor presente en el array genera una bandera nueva.
- fields: array, los campos del contrato que contienen los valores a ser sumados.

**Tipo: limited-party-accumulator-percent**

Descripción: compara el conteo de contratos de un proveedor contra un porcentaje del conteo de contratos de un comprador.

Parámetros:
- limit: array, los porcentajes del conteo de contratos del comprador contra el cual se compara para cada proveedor. Cada valor presente en el array genera una bandera nueva.
- accumulator_minimum: cantidad mínima de contratos de un proveedor que activa la evaluación de esta bandera.

**Tipo: limited-accumulator-percent**

Descripción: compara la cantidad de veces que aparece cada valor único de un campo (por ejemplo, el título de un contrato) contra un porcentaje del total de contratos realizados por la misma entidad.

Parámetros:
- limit: array, los porcentajes del total de contratos contra los que se compara cada valor único del campo. Cada valor presente en el array genera una bandera nueva.
- minimum_contract_count: total mínimo de contratos realizados para activar la evaluación de esta bandera.
- accumulator_minimum: mínimo de ocurrencias de un valor único para activar la evaluación de esta bandera.
- fields: array, los campos del contrato que contienen los valores a ser comparados.

**Tipo: limited-party-accumulator-count**

Descripción: compara el número de valores únicos distintos de un campo contra el límite definido.

Parámetros:
- limit: array, los valores contra los que se compara la cantidad de valores únicos de cada campo (si es mayor al límite se levanta la bandera). Cada valor presente en el array genera una bandera nueva.
- global: boolean, si el valor del parámetro es true los valores únicos se acumulan a lo largo de todos los años evaluados, en lugar de realizar una evaluación por año. El default de este parámetro es false.
- fields: array, los campos del contrato que contienen los valores a ser comparados.

### Condiciones

Cada campo de parámetros puede ser un array que soporta condiciones y operaciones.
Si las condiciones se cumplen, se aplica el value de esa condición. El campo es un array. Cada elemento es un objeto con las siguientes propiedades:

- conditions: un objeto con campos y valores. Cada valor puede ser un objeto con un miembro and u or, y dentro de ese miembro un array de valores posibles para el campo.
- value: el valor que toma el campo si se cumplen las condiciones

Si no se cumple ninguna de las condiciones, el campo queda sin valor. Si ningún campo tiene valor, la regla da false.

### Operaciones

Sobre cada *field* se puede aplicar una operación. La operación se define como nombre:valor y el único nombre soportado por el momento es *substr*. El valor de esta operación es un array de parámetros: desde qué caracter, y cuántos caracteres.

También soporta un número negativo como único parámetro, que indica cuántos caracteres desde el final del string.

### Evaluaciones custom

Es posible definir funciones adicionales a las definidas anteriormente mediante el tipo de bandera custom y una definición en Javascript, como se puede ver en [este ejemplo](https://github.com/ProjectPODER/groucho/blob/main/evaluator/redFlags/customCRFlags.js).

Tipo: custom

Descripción: implementa una función Javascript definida en un archivo externo.

Parámetros:
- file: nombre del archivo que contiene la definición custom. El archivo debe existir dentro de la carpeta evaluator/redFlags/ y contener al menos una función definida en Javascript.
- function: el nombre exacto de la función implementada en el archivo custom.
La función custom recibe como parámetro el contrato a ser evaluado, y debe retornar un valor entre 0 y 1. Es recomendable utilizar las funciones definidas en el archivo evaluator/redFlags/util.js para facilitar las operaciones sobre campos del contrato, así como la implementación de condiciones.
