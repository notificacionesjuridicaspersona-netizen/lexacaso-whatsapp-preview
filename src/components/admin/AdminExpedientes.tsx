const handleImportFiles = async () => {
    if (!importTarget || importFiles.length === 0) return;
    setImportRunning(true);
    const userId = importTarget.user_id;

    const progress: typeof importProgress = importFiles.map((f) => ({
      current: 0,
      total: importFiles.length,
      name: f.name,
      status: 'pending' as const,
    }));
    setImportProgress(progress);

    for (let i = 0; i < importFiles.length; i++) {
      const file = importFiles[i];
      const ext = getFileExtension(file.name).toLowerCase().replace('.', '');

      // Actualizar estado a procesando
      setImportProgress((prev) =>
        prev.map((p, idx) => (idx === i ? { ...p, status: 'pending' as const } : p))
      );

      // Validar previamente el archivo
      const validation = validateFile(file);
      if (!validation.valid) {
        setImportProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'error' as const, error: validation.error } : p
          )
        );
        continue;
      }

      if (ext === 'zip') {
        const result = await extractAndUploadZipFiles(file, importTarget.id, userId, null);
        setImportProgress((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  status: result.failed === 0 ? ('success' as const) : ('error' as const),
                  error: result.errors.join('; ') || undefined,
                }
              : p
          )
        );
      } else {
        const result = await uploadDocument(file, importTarget.id, userId);
        setImportProgress((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  status: result.success ? ('success' as const) : ('error' as const),
                  error: result.error,
                }
              : p
          )
        );
      }
    }

    setImportRunning(false);

    if (selectedExp?.id === importTarget.id) {
      const { data } = await supabase
        .from('documentos')
        .select('*')
        .eq('expediente_id', importTarget.id)
        .order('created_at', { ascending: false });
      if (data) setExpDocumentos(data as Documento[]);
    }

    await logAuditoria(
      'importar_documentos',
      `${importFiles.length} archivo(s) al expediente: ${importTarget.titulo}`,
      'expediente',
      importTarget.id
    );
    doSearch();
  };
