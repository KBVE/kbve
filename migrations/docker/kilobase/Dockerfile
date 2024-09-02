FROM supabase/postgres:15.6.1.115 AS base

RUN apt-get update && \
    apt-get install -y --no-install-recommends jemalloc && \
    rm -rf /var/lib/apt/lists/*

ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Configure huge pages
# Note: These settings might need to be applied within the host system as Docker containers often inherit kernel settings from the host.
RUN echo 'vm.nr_hugepages = 128' >> /etc/sysctl.conf && \
    echo 'vm.hugetlb_shm_group = 1000' >> /etc/sysctl.conf && \
    sysctl -p

# Additional performance settings (optional)
# You can add any other system or database tuning parameters here

# Reapply any necessary permissions
RUN chown postgres:postgres /etc/sysctl.conf && chmod 644 /etc/sysctl.conf

# Optionally, if you want to apply custom PostgreSQL configurations
COPY custom_postgresql.conf /etc/postgresql/postgresql.conf

# Set entrypoint and command
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["postgres", "-D", "/etc/postgresql"]

# Health check (optional, adjust as needed)
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD pg_isready -U postgres -h localhost || exit 1
