from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("tienda", "0002_fichas_y_notas")]
    operations = [migrations.AddField(model_name="descuento", name="disponible", field=models.BooleanField(default=True))]
