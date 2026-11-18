# Stage 1: Build the backend with Gradle
FROM eclipse-temurin:25-jdk-alpine AS builder

WORKDIR /app

# Copy build files and Gradle wrapper
COPY gradlew gradlew
COPY gradle gradle
COPY build.gradle settings.gradle ./

# Ensure gradlew has execute permission
RUN chmod +x gradlew

# Pre-cache dependencies
RUN ./gradlew dependencies --no-daemon || true

# Copy source code and build production jar
COPY src src
RUN ./gradlew bootJar --no-daemon -x test

# Stage 2: Minimal Production Runtime
# Must be JDK (not JRE) so javax.tools.JavaCompiler and com.sun.jdi are present
FROM eclipse-temurin:25-jdk-alpine

WORKDIR /app

# Create workdir for compiled student classes
RUN mkdir -p /tmp/jviz-workdir && chmod 777 /tmp/jviz-workdir

# Copy the built jar from builder
COPY --from=builder /app/build/libs/app.jar app.jar

# Render / Cloud dynamic port binding
ENV PORT=8080
ENV ALLOWED_ORIGINS=*

EXPOSE ${PORT}

# Run with low-memory footprint (64MB min, 220MB max heap, Serial GC)
# leaving 292MB headroom inside 512MB RAM container for child JDI target JVMs and metaspace
ENTRYPOINT ["java", \
  "-Xms64m", \
  "-Xmx220m", \
  "-XX:+UseSerialGC", \
  "--add-modules", "jdk.jdi", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
