const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
        }
      } else if (mode === 'register') {
        if (!aceptaTerminos) {
          setError('Debe aceptar los Términos y Condiciones para continuar.');
          setLoading(false);
          return;
        }
        if (!aceptaHabeasData) {
          setError('Debe autorizar el tratamiento de sus datos personales (Ley 1581 de 2012) para continuar.');
          setLoading(false);
          return;
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nombre_completo: nombreCompleto || email,
              cedula,
              celular,
              direccion,
              autorizacion_datos: true,
            },
          },
        });

        if (signUpError) {
          setError(signUpError.message);
        } else {
          setSuccess('Cuenta creada correctamente. Inicie sesión para continuar.');
          setMode('login');
          setPassword('');
        }
      } else if (mode === 'recover') {
        const { error: recoverError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (recoverError) {
          setError(recoverError.message);
        } else {
          setSuccess('Se ha enviado un enlace de recuperación a su correo.');
        }
      }
    } catch (e: any) {
      console.error('Error en autenticación:', e);
      setError(e?.message || 'Ocurrió un error inesperado al procesar la solicitud.');
    } finally {
      setLoading(false);
    }
  };